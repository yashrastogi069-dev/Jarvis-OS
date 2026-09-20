/**
 * JARVIS CORE V2 — PERSISTENT OPERATION LEDGER TESTS
 * 
 * Checkpoint: C5
 * Verifies:
 * 1. Schema initialization & index creation.
 * 2. Claim-before-execute pattern (CLAIMED status, operationId, dedupeKey).
 * 3. Successful completion & result payload caching.
 * 4. Logical idempotency: cached replay within idempotency window.
 * 5. Concurrent execution conflict prevention (CONFLICT status).
 * 6. UNKNOWN_COMMIT preservation on external mutation timeout.
 * 7. FAILED_RETRYABLE allows re-claim; FAILED_FINAL blocks duplicate.
 * 8. Idempotency window expiration allows fresh execution.
 * 9. Canonical argument hashing & key order invariance.
 * 10. Crash restart recovery transitions RUNNING to UNKNOWN_COMMIT or FAILED_RETRYABLE.
 * 11. Quest & Step lineage persistence.
 * 12. Payload secret sanitization in SQLite storage.
 * 13. Retention pruning of completed operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { OperationLedger } from "../../lib/jarvis-core/ledger/ledger"
import {
  computeDedupeKey,
  hashCanonicalInput,
  deriveActionOperationId,
  deriveQuestStepOperationId,
} from "../../lib/jarvis-core/ledger/canonical"
import { asCapabilityId, asTurnId, asQuestId, asPlanStepId } from "../../lib/jarvis-core/types"

describe("C5 — Persistent Operation Ledger & Logical Idempotency", () => {
  let inMemoryDb: Database.Database
  let ledger: OperationLedger

  beforeEach(() => {
    inMemoryDb = new Database(":memory:")
    ledger = new OperationLedger(inMemoryDb)
  })

  afterEach(() => {
    try {
      inMemoryDb.close()
    } catch {
      // already closed
    }
  })

  // ==========================================================================
  // 1. SCHEMA INITIALIZATION & INDEXES
  // ==========================================================================
  describe("Schema Initialization", () => {
    it("creates the operations table and required indexes idempotently", () => {
      const tableInfo = inMemoryDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='operations'")
        .get() as { name: string } | undefined

      expect(tableInfo?.name).toBe("operations")

      const indexes = inMemoryDb
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='operations'")
        .all() as Array<{ name: string }>

      const indexNames = indexes.map((idx) => idx.name)
      expect(indexNames).toContain("idx_operations_dedupe_key")
      expect(indexNames).toContain("idx_operations_status")
      expect(indexNames).toContain("idx_operations_created_at")
    })
  })

  // ==========================================================================
  // 2. CLAIM-BEFORE-EXECUTE & COMPLETION
  // ==========================================================================
  describe("Claim & Completion Lifecycle", () => {
    it("claims a new operation and returns CLAIMED with unique operationId and dedupeKey", () => {
      const res = ledger.claimOperation({
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Buy Milk" },
      })

      expect(res.status).toBe("CLAIMED")
      if (res.status === "CLAIMED") {
        expect(res.operationId).toMatch(/^op_\d+_[a-f0-9]{16}$/)
        expect(res.dedupeKey).toMatch(/^dk_tasks_create_[a-f0-9]{24}$/)

        const record = ledger.getOperation(res.operationId)
        expect(record).toBeDefined()
        expect(record?.status).toBe("RUNNING")
        expect(record?.capabilityId).toBe("tasks.create")
        expect(record?.actionClass).toBe("LOCAL_CREATE")
        expect(record?.inputPayload).toEqual({ title: "Buy Milk" })
      }
    })

    it("completes an operation and updates SQLite with SUCCEEDED and resultPayload", () => {
      const claim = ledger.claimOperation({
        capabilityId: asCapabilityId("tasks.complete"),
        actionClass: "LOCAL_UPDATE",
        idempotencyClass: "NATURALLY_IDEMPOTENT",
        input: { id: 42 },
      })

      expect(claim.status).toBe("CLAIMED")
      if (claim.status !== "CLAIMED") return

      ledger.completeOperation({
        operationId: claim.operationId,
        resultPayload: { completed: true, taskId: 42 },
      })

      const record = ledger.getOperation(claim.operationId)
      expect(record?.status).toBe("SUCCEEDED")
      expect(record?.resultPayload).toEqual({ completed: true, taskId: 42 })
      expect(record?.completedAt).toBeDefined()
      expect(record?.completedAt).toBeGreaterThan(0)
    })
  })

  // ==========================================================================
  // 3. LOGICAL IDEMPOTENCY: CACHED REPLAY
  // ==========================================================================
  describe("Logical Idempotency & Replay Protection", () => {
    it("returns CACHED result on duplicate idempotent invocation within window without re-running", () => {
      const capId = asCapabilityId("tasks.delete")
      const input = { id: 101 }

      // 1. First execution
      const claim1 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "LOCAL_DELETE",
        idempotencyClass: "NATURALLY_IDEMPOTENT",
        input,
      })
      expect(claim1.status).toBe("CLAIMED")
      if (claim1.status !== "CLAIMED") return

      ledger.completeOperation({
        operationId: claim1.operationId,
        resultPayload: { deleted: true, id: 101 },
      })

      // 2. Second execution with identical args
      const claim2 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "LOCAL_DELETE",
        idempotencyClass: "NATURALLY_IDEMPOTENT",
        input,
      })

      expect(claim2.status).toBe("CACHED")
      if (claim2.status === "CACHED") {
        expect(claim2.record.operationId).toBe(claim1.operationId)
        expect(claim2.resultPayload).toEqual({ deleted: true, id: 101 })
      }
    })

    it("allows fresh execution when idempotency window expires", () => {
      const capId = asCapabilityId("tasks.complete")
      const input = { id: 5 }

      // Custom short window: 100ms
      const claim1 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "LOCAL_UPDATE",
        idempotencyClass: "NATURALLY_IDEMPOTENT",
        input,
        idempotencyWindowMs: 100,
      })
      expect(claim1.status).toBe("CLAIMED")
      if (claim1.status !== "CLAIMED") return

      ledger.completeOperation({
        operationId: claim1.operationId,
        resultPayload: { done: true },
      })

      // Advance clock past 100ms window
      vi.useFakeTimers()
      try {
        vi.advanceTimersByTime(200)

        const claim2 = ledger.claimOperation({
          capabilityId: capId,
          actionClass: "LOCAL_UPDATE",
          idempotencyClass: "NATURALLY_IDEMPOTENT",
          input,
          idempotencyWindowMs: 100,
        })

        expect(claim2.status).toBe("CLAIMED")
        if (claim2.status === "CLAIMED") {
          expect(claim2.operationId).not.toBe(claim1.operationId)
        }
      } finally {
        vi.useRealTimers()
      }
    })
  })

  // ==========================================================================
  // 4. CONCURRENT EXECUTION CONFLICT GUARD
  // ==========================================================================
  describe("Concurrent Execution Guard", () => {
    it("returns CONFLICT when a second operation is attempted while first is RUNNING", () => {
      const capId = asCapabilityId("google.mail.message.send")
      const input = { to: "alice@example.com", subject: "Hello", body: "Test" }

      // 1. First claim starts RUNNING
      const claim1 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "EXTERNAL_SEND",
        idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
        input,
      })
      expect(claim1.status).toBe("CLAIMED")
      if (claim1.status !== "CLAIMED") return

      // 2. Second claim arrives concurrently before first completes
      const claim2 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "EXTERNAL_SEND",
        idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
        input,
      })

      expect(claim2.status).toBe("CONFLICT")
      if (claim2.status === "CONFLICT") {
        expect(claim2.operationId).toBe(claim1.operationId)
        expect(claim2.reason).toContain("already in progress")
      }
    })
  })

  // ==========================================================================
  // 5. UNKNOWN_COMMIT PROTECTION
  // ==========================================================================
  describe("UNKNOWN_COMMIT Safety", () => {
    it("blocks automated replay when an external mutation ends in UNKNOWN_COMMIT", () => {
      const capId = asCapabilityId("google.mail.message.send")
      const input = { to: "bob@example.com", subject: "Invoice", body: "Amount $50" }

      // 1. First claim
      const claim1 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "EXTERNAL_SEND",
        idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
        input,
      })
      expect(claim1.status).toBe("CLAIMED")
      if (claim1.status !== "CLAIMED") return

      // 2. Network timeout occurs -> marked UNKNOWN_COMMIT
      ledger.failOperation({
        operationId: claim1.operationId,
        errorCode: "UNKNOWN_COMMIT",
        errorMessage: "Network socket closed before HTTP response received.",
        isRetryable: false,
        isUnknownCommit: true,
      })

      const rec = ledger.getOperation(claim1.operationId)
      expect(rec?.status).toBe("UNKNOWN_COMMIT")

      // 3. Automated retry attempt with same payload is BLOCKED
      const claim2 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "EXTERNAL_SEND",
        idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
        input,
      })

      expect(claim2.status).toBe("UNKNOWN_COMMIT")
      if (claim2.status === "UNKNOWN_COMMIT") {
        expect(claim2.reason).toContain("uncertain external state (UNKNOWN_COMMIT)")
        expect(claim2.operationId).toBe(claim1.operationId)
      }
    })
  })

  // ==========================================================================
  // 6. RETRYABLE AND FINAL FAILURE HANDLING
  // ==========================================================================
  describe("Failure Modes", () => {
    it("allows fresh claim when previous attempt was FAILED_RETRYABLE", () => {
      const capId = asCapabilityId("tasks.create")
      const input = { title: "Temporary task" }

      const claim1 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input,
      })
      if (claim1.status !== "CLAIMED") return

      // Fail with transient error
      ledger.failOperation({
        operationId: claim1.operationId,
        errorCode: "RATE_LIMITED",
        errorMessage: "Too many requests, try again shortly.",
        isRetryable: true,
      })

      const rec = ledger.getOperation(claim1.operationId)
      expect(rec?.status).toBe("FAILED_RETRYABLE")

      // Subsequent claim is allowed
      const claim2 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input,
      })

      expect(claim2.status).toBe("CLAIMED")
      if (claim2.status === "CLAIMED") {
        expect(claim2.operationId).not.toBe(claim1.operationId)
      }
    })

    it("blocks duplicate when previous attempt was FAILED_FINAL", () => {
      const capId = asCapabilityId("tasks.complete")
      const input = { id: 999999 }

      const claim1 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "LOCAL_UPDATE",
        idempotencyClass: "NATURALLY_IDEMPOTENT",
        input,
      })
      if (claim1.status !== "CLAIMED") return

      // Fail with final not-found error
      ledger.failOperation({
        operationId: claim1.operationId,
        errorCode: "NOT_FOUND",
        errorMessage: "Task #999999 does not exist.",
        isRetryable: false,
      })

      const claim2 = ledger.claimOperation({
        capabilityId: capId,
        actionClass: "LOCAL_UPDATE",
        idempotencyClass: "NATURALLY_IDEMPOTENT",
        input,
      })

      expect(claim2.status).toBe("FAILED_FINAL")
      if (claim2.status === "FAILED_FINAL") {
        expect(claim2.reason).toContain("Task #999999 does not exist.")
      }
    })
  })

  // ==========================================================================
  // 7. CANONICAL DEDUPE KEY INTEGRITY
  // ==========================================================================
  describe("DedupeKey Stability & Invariance", () => {
    it("generates identical dedupeKey regardless of object key order", () => {
      const key1 = computeDedupeKey({
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { a: "apple", b: "banana", nested: { y: 2, x: 1 } },
      })

      const key2 = computeDedupeKey({
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { nested: { x: 1, y: 2 }, b: "banana", a: "apple" },
      })

      expect(key1).toBe(key2)
    })

    it("generates distinct dedupeKeys for distinct input arguments", () => {
      const key1 = computeDedupeKey({
        capabilityId: asCapabilityId("tasks.complete"),
        actionClass: "LOCAL_UPDATE",
        idempotencyClass: "NATURALLY_IDEMPOTENT",
        input: { id: 1 },
      })

      const key2 = computeDedupeKey({
        capabilityId: asCapabilityId("tasks.complete"),
        actionClass: "LOCAL_UPDATE",
        idempotencyClass: "NATURALLY_IDEMPOTENT",
        input: { id: 2 },
      })

      expect(key1).not.toBe(key2)
    })
  })

  // ==========================================================================
  // 8. CRASH RESTAURANT RECOVERY
  // ==========================================================================
  describe("Crash Recovery", () => {
    it("recovers orphaned RUNNING operations to UNKNOWN_COMMIT for mutations and FAILED_RETRYABLE for READ_ONLY", () => {
      // Simulate crash: write orphaned records directly to SQLite
      inMemoryDb.exec(`
        INSERT INTO operations (
          operation_id, dedupe_key, capability_id, action_class, status,
          input_hash, input_payload, created_at, updated_at
        ) VALUES
        ('op_crash_ext', 'dk_ext', 'google.mail.message.send', 'EXTERNAL_SEND', 'RUNNING', 'h1', '{}', 1000, 1000),
        ('op_crash_local', 'dk_loc', 'tasks.create', 'LOCAL_CREATE', 'RUNNING', 'h2', '{}', 1000, 1000),
        ('op_crash_read', 'dk_read', 'tasks.list', 'READ_ONLY', 'RUNNING', 'h3', '{}', 1000, 1000);
      `)

      const recoveredCount = ledger.recoverCrashedOperations()
      expect(recoveredCount).toBe(3)

      const extRecord = ledger.getOperation("op_crash_ext")
      expect(extRecord?.status).toBe("UNKNOWN_COMMIT")
      expect(extRecord?.errorMessage).toContain("crash recovery to UNKNOWN_COMMIT")

      // Local mutations commit independently in SQLite, so crash window makes commit uncertain
      const localRecord = ledger.getOperation("op_crash_local")
      expect(localRecord?.status).toBe("UNKNOWN_COMMIT")
      expect(localRecord?.errorMessage).toContain("crash recovery to UNKNOWN_COMMIT")

      // Read-only operations have zero side-effects and can safely retry
      const readRecord = ledger.getOperation("op_crash_read")
      expect(readRecord?.status).toBe("FAILED_RETRYABLE")
      expect(readRecord?.errorMessage).toContain("crash recovery to FAILED_RETRYABLE")
    })
  })

  // ==========================================================================
  // 9. QUEST & STEP LINKAGE
  // ==========================================================================
  describe("Quest Lineage Linkage", () => {
    it("persists and retrieves questId and stepId linkage", () => {
      const claim = ledger.claimOperation({
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Subtask for Quest" },
        questId: "quest_abc_123",
        stepId: "step_def_456",
      })

      if (claim.status !== "CLAIMED") return

      const record = ledger.getOperation(claim.operationId)
      expect(record?.questId).toBe("quest_abc_123")
      expect(record?.stepId).toBe("step_def_456")
    })
  })

  // ==========================================================================
  // 10. SECRET REDACTION IN STORED PAYLOADS
  // ==========================================================================
  describe("Payload Sanitization in SQLite", () => {
    it("redacts sensitive bearer tokens and secrets from stored SQLite input and result payloads", () => {
      const claim = ledger.claimOperation({
        capabilityId: asCapabilityId("preferences.set"),
        actionClass: "LOCAL_UPDATE",
        idempotencyClass: "NATURALLY_IDEMPOTENT",
        input: { apiKey: "ghp_1234567890abcdef1234567890abcdef" },
      })

      if (claim.status !== "CLAIMED") return

      ledger.completeOperation({
        operationId: claim.operationId,
        resultPayload: { token: "Bearer secret_bearer_token_xyz" },
      })

      const rawRow = inMemoryDb
        .prepare("SELECT input_payload, result_payload FROM operations WHERE operation_id = ?")
        .get(claim.operationId) as { input_payload: string; result_payload: string }

      expect(rawRow.input_payload).toContain("[REDACTED_GITHUB_TOKEN]")
      expect(rawRow.input_payload).not.toContain("ghp_1234567890abcdef")

      expect(rawRow.result_payload).toContain("Bearer [REDACTED]")
      expect(rawRow.result_payload).not.toContain("secret_bearer_token_xyz")
    })
  })

  // ==========================================================================
  // 11. RETENTION PRUNING
  // ==========================================================================
  describe("Retention Pruning", () => {
    it("prunes completed operations older than threshold while preserving recent operations", () => {
      const now = Date.now()
      const oldTime = now - 35 * 24 * 60 * 60 * 1000 // 35 days old
      const recentTime = now - 1 * 24 * 60 * 60 * 1000 // 1 day old

      inMemoryDb.exec(`
        INSERT INTO operations (
          operation_id, dedupe_key, capability_id, action_class, status,
          input_hash, created_at, updated_at
        ) VALUES
        ('op_old_done', 'dk_1', 'tasks.list', 'READ_ONLY', 'SUCCEEDED', 'h1', ${oldTime}, ${oldTime}),
        ('op_recent_done', 'dk_2', 'tasks.list', 'READ_ONLY', 'SUCCEEDED', 'h2', ${recentTime}, ${recentTime}),
        ('op_old_active', 'dk_3', 'tasks.list', 'READ_ONLY', 'RUNNING', 'h3', ${oldTime}, ${oldTime});
      `)

      // Prune older than 30 days
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
      const deleted = ledger.pruneOldOperations(thirtyDaysMs)

      expect(deleted).toBe(1)
      expect(ledger.getOperation("op_old_done")).toBeUndefined()
      expect(ledger.getOperation("op_recent_done")).toBeDefined()
      // RUNNING operations are never pruned by standard cleanup
      expect(ledger.getOperation("op_old_active")).toBeDefined()
    })
  })

  // ==========================================================================
  // 12. SECTION 4: REQUIRED C5 IDENTITY TESTS (TESTS A, B, C, D, E)
  // ==========================================================================
  describe("Section 4 — Required Logical Operation Identity Tests", () => {
    it("Test A: same OperationId with same arguments returns cached result without re-executing handler", () => {
      const opId = deriveActionOperationId(asTurnId("turn_1"), 0, asCapabilityId("tasks.create"))
      let handlerExecutions = 0
      const execute = (input: { title: string }) => {
        handlerExecutions++
        return { taskId: 101, title: input.title }
      }

      // First attempt: claims, runs handler, completes
      const claim1 = ledger.claimOperation({
        operationId: opId,
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Drink Water" },
      })
      expect(claim1.status).toBe("CLAIMED")
      if (claim1.status === "CLAIMED") {
        const result = execute({ title: "Drink Water" })
        ledger.completeOperation({
          operationId: claim1.operationId,
          resultPayload: result,
        })
      }

      expect(handlerExecutions).toBe(1)

      // Second attempt (e.g. model retry / loop failover of SAME logical turn operation)
      const claim2 = ledger.claimOperation({
        operationId: opId,
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Drink Water" },
      })

      expect(claim2.status).toBe("CACHED")
      if (claim2.status === "CACHED") {
        expect(claim2.resultPayload).toEqual({ taskId: 101, title: "Drink Water" })
      }
      // Handler must NOT have executed a second time
      expect(handlerExecutions).toBe(1)
    })

    it("Test B: different OperationIds with same capability and same arguments execute twice (distinct user actions)", () => {
      // Turn A: "Create a task called Drink Water."
      const opId1 = deriveActionOperationId(asTurnId("turn_A"), 0, asCapabilityId("tasks.create"))
      // Turn B: "Create another task called Drink Water."
      const opId2 = deriveActionOperationId(asTurnId("turn_B"), 0, asCapabilityId("tasks.create"))

      let handlerExecutions = 0
      const execute = (input: { title: string }) => {
        handlerExecutions++
        return { taskId: 100 + handlerExecutions, title: input.title }
      }

      // Turn A executes
      const claim1 = ledger.claimOperation({
        operationId: opId1,
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Drink Water" },
      })
      expect(claim1.status).toBe("CLAIMED")
      if (claim1.status === "CLAIMED") {
        const res1 = execute({ title: "Drink Water" })
        ledger.completeOperation({ operationId: claim1.operationId, resultPayload: res1 })
      }

      // Turn B executes - identical payload, but distinct OperationId
      const claim2 = ledger.claimOperation({
        operationId: opId2,
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Drink Water" },
      })
      expect(claim2.status).toBe("CLAIMED")
      if (claim2.status === "CLAIMED") {
        const res2 = execute({ title: "Drink Water" })
        ledger.completeOperation({ operationId: claim2.operationId, resultPayload: res2 })
      }

      // Distinct logical actions: handler must execute twice!
      expect(handlerExecutions).toBe(2)
    })

    it("Test C: same OperationId with different arguments triggers CONFLICT and blocks execution", () => {
      const opId = deriveActionOperationId(asTurnId("turn_tamper"), 0, asCapabilityId("tasks.create"))

      const claim1 = ledger.claimOperation({
        operationId: opId,
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Original Title" },
      })
      expect(claim1.status).toBe("CLAIMED")

      // Attempt to claim same OperationId with altered arguments
      const claim2 = ledger.claimOperation({
        operationId: opId,
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Tampered Title" },
      })

      expect(claim2.status).toBe("CONFLICT")
      if (claim2.status === "CONFLICT") {
        expect(claim2.reason).toContain("canonical argument hash")
      }
    })

    it("Test D: retry of same QuestId + PlanStepId produces identical logical OperationId", () => {
      const questId = asQuestId("quest_100")
      const stepId = asPlanStepId("step_retry")
      const capId = asCapabilityId("tasks.create")

      const opIdFirst = deriveQuestStepOperationId(questId, stepId, capId)
      const opIdSecond = deriveQuestStepOperationId(questId, stepId, capId)

      expect(opIdFirst).toBe(opIdSecond)
    })

    it("Test E: different Quest steps with same payload produce distinct OperationIds", () => {
      const questId = asQuestId("quest_100")
      const step1Id = asPlanStepId("step_1")
      const step2Id = asPlanStepId("step_2")
      const capId = asCapabilityId("tasks.create")

      const opIdStep1 = deriveQuestStepOperationId(questId, step1Id, capId)
      const opIdStep2 = deriveQuestStepOperationId(questId, step2Id, capId)

      expect(opIdStep1).not.toBe(opIdStep2)

      const claim1 = ledger.claimOperation({
        operationId: opIdStep1,
        capabilityId: capId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Buy Milk" },
        questId,
        stepId: step1Id,
      })
      const claim2 = ledger.claimOperation({
        operationId: opIdStep2,
        capabilityId: capId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Buy Milk" },
        questId,
        stepId: step2Id,
      })

      expect(claim1.status).toBe("CLAIMED")
      expect(claim2.status).toBe("CLAIMED")
    })
  })

  // ==========================================================================
  // 13. SECTION 5.3: CRASH-WINDOW FAULT INJECTION (FILE-BACKED SQLITE)
  // ==========================================================================
  describe("Section 5.3 — Crash-Window Fault Injection (File-backed SQLite)", () => {
    let tempDir: string
    let dbFilePath: string

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-crash-test-"))
      dbFilePath = path.join(tempDir, "crash_test.db")
    })

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    })

    it("simulates crash between local tasks.create commit and ledger completion, proving duplicate execution is blocked", () => {
      // 1. Initial process: Open file-backed DB and initialize tasks & operations tables
      const procDb = new Database(dbFilePath)
      procDb.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `)
      const procLedger = new OperationLedger(procDb)

      const opId = deriveActionOperationId(asTurnId("turn_crash"), 0, asCapabilityId("tasks.create"))
      const taskInput = { title: "Critical Task" }

      // Step 1: Ledger claim
      const claim = procLedger.claimOperation({
        operationId: opId,
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: taskInput,
      })
      expect(claim.status).toBe("CLAIMED")

      // Step 2: Local business mutation writes to tasks table
      procDb.prepare("INSERT INTO tasks (title, created_at) VALUES (?, ?)").run(taskInput.title, Date.now())

      // Verify task exists in business table
      const taskCountPreCrash = procDb.prepare("SELECT COUNT(*) as count FROM tasks WHERE title = ?").get(taskInput.title) as { count: number }
      expect(taskCountPreCrash.count).toBe(1)

      // Step 3: CRASH! Process dies abruptly before ledger.completeOperation() is executed.
      procDb.close()

      // Step 4: System reboots. Re-open DB with new process / instance.
      const rebootDb = new Database(dbFilePath)
      const rebootLedger = new OperationLedger(rebootDb)

      // Step 5: Boot recovery routine runs
      const recoveredCount = rebootLedger.recoverCrashedOperations()
      expect(recoveredCount).toBe(1)

      const recoveredOp = rebootLedger.getOperation(opId)
      expect(recoveredOp?.status).toBe("UNKNOWN_COMMIT")

      // Step 6: Attempted replay: Caller tries to re-claim same operationId
      const replayClaim = rebootLedger.claimOperation({
        operationId: opId,
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: taskInput,
      })

      // Invariant: System CANNOT silently create a duplicate logical mutation!
      expect(replayClaim.status).toBe("UNKNOWN_COMMIT")
      if (replayClaim.status === "UNKNOWN_COMMIT") {
        expect(replayClaim.reason).toContain("UNKNOWN_COMMIT")
      }

      // Assert business table still has exactly 1 task
      const taskCountPostCrash = rebootDb.prepare("SELECT COUNT(*) as count FROM tasks WHERE title = ?").get(taskInput.title) as { count: number }
      expect(taskCountPostCrash.count).toBe(1)

      rebootDb.close()
    }, 15000)

    it("simulates crash during memory.save mutation, verifying UNKNOWN_COMMIT blocks duplicate write", () => {
      const procDb = new Database(dbFilePath)
      procDb.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `)
      const procLedger = new OperationLedger(procDb)

      const opId = deriveActionOperationId(asTurnId("turn_mem_crash"), 0, asCapabilityId("memory.save"))
      const memInput = { content: "User likes dark mode" }

      const claim = procLedger.claimOperation({
        operationId: opId,
        capabilityId: asCapabilityId("memory.save"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: memInput,
      })
      expect(claim.status).toBe("CLAIMED")

      procDb.prepare("INSERT INTO memories (content, created_at) VALUES (?, ?)").run(memInput.content, Date.now())

      // Crash before ledger completion
      procDb.close()

      // Reboot
      const rebootDb = new Database(dbFilePath)
      const rebootLedger = new OperationLedger(rebootDb)

      const recoveredCount = rebootLedger.recoverCrashedOperations()
      expect(recoveredCount).toBe(1)

      const replayClaim = rebootLedger.claimOperation({
        operationId: opId,
        capabilityId: asCapabilityId("memory.save"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: memInput,
      })

      expect(replayClaim.status).toBe("UNKNOWN_COMMIT")

      const memCount = rebootDb.prepare("SELECT COUNT(*) as count FROM memories WHERE content = ?").get(memInput.content) as { count: number }
      expect(memCount.count).toBe(1)

      rebootDb.close()
    }, 15000)
  })

  // ==========================================================================
  // 12. DIRECT ACTION RETRY IDENTITY PROOF (PART 1.3)
  // ==========================================================================
  describe("Direct ACTION Retry Identity Proof (Part 1.3)", () => {
    it("proves transport retry or provider failover preserves OperationId, new turns get new OperationId, and argument tampering causes CONFLICT", () => {
      const runtimeTurnId = asTurnId("turn_runtime_owned_999")
      const slot = 0
      const capId = asCapabilityId("tasks.create")
      const initialPayload = { title: "Buy groceries for dinner" }

      // 1. Initial invocation (e.g. Primary provider Gemini attempted)
      const opId1 = deriveActionOperationId(runtimeTurnId, slot, capId)
      const claim1 = ledger.claimOperation({
        operationId: opId1,
        capabilityId: capId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: initialPayload,
      })
      expect(claim1.status).toBe("CLAIMED")

      // Complete execution of the initial attempt
      ledger.completeOperation({
        operationId: opId1,
        resultPayload: { taskId: 42, title: initialPayload.title },
      })

      // 2. Runtime / Provider retry within same TurnId, same slot, same CapabilityId
      // Invariant: Transport retry or provider failover (e.g. Gemini -> Groq failover)
      // must NOT create a new logical operation identity. Runtime owns TurnId.
      const retryOpId = deriveActionOperationId(runtimeTurnId, slot, capId)
      expect(retryOpId).toBe(opId1)

      const retryClaim = ledger.claimOperation({
        operationId: retryOpId,
        capabilityId: capId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: initialPayload,
      })
      expect(retryClaim.status).toBe("CACHED")
      if (retryClaim.status === "CACHED") {
        expect(retryClaim.resultPayload).toEqual({ taskId: 42, title: initialPayload.title })
      }

      // 3. New user turn with identical capability and identical payload
      // Invariant: New turn MUST produce a different OperationId and must NOT be falsely suppressed.
      const newTurnId = asTurnId("turn_runtime_owned_1000")
      const newTurnOpId = deriveActionOperationId(newTurnId, slot, capId)
      expect(newTurnOpId).not.toBe(opId1)

      const newTurnClaim = ledger.claimOperation({
        operationId: newTurnOpId,
        capabilityId: capId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: initialPayload,
      })
      expect(newTurnClaim.status).toBe("CLAIMED")

      // 4. Same OperationId + changed arguments -> CONFLICT (INPUT_HASH_MISMATCH)
      const tamperedClaim = ledger.claimOperation({
        operationId: opId1,
        capabilityId: capId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Tampered payload: delete everything" },
      })
      expect(tamperedClaim.status).toBe("CONFLICT")
      if (tamperedClaim.status === "CONFLICT") {
        expect(tamperedClaim.reason).toContain("different canonical argument hash")
      }
    })
  })
})

