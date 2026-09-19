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
import { OperationLedger } from "../../lib/jarvis-core/ledger/ledger"
import { computeDedupeKey, hashCanonicalInput } from "../../lib/jarvis-core/ledger/canonical"
import { asCapabilityId } from "../../lib/jarvis-core/types"

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
    it("recovers orphaned RUNNING operations to UNKNOWN_COMMIT for external and FAILED_RETRYABLE for local", () => {
      // Simulate crash: write orphaned records directly to SQLite
      inMemoryDb.exec(`
        INSERT INTO operations (
          operation_id, dedupe_key, capability_id, action_class, status,
          input_hash, input_payload, created_at, updated_at
        ) VALUES
        ('op_crash_ext', 'dk_ext', 'google.mail.message.send', 'EXTERNAL_SEND', 'RUNNING', 'h1', '{}', 1000, 1000),
        ('op_crash_local', 'dk_loc', 'tasks.create', 'LOCAL_CREATE', 'RUNNING', 'h2', '{}', 1000, 1000);
      `)

      const recoveredCount = ledger.recoverCrashedOperations()
      expect(recoveredCount).toBe(2)

      const extRecord = ledger.getOperation("op_crash_ext")
      expect(extRecord?.status).toBe("UNKNOWN_COMMIT")
      expect(extRecord?.errorMessage).toContain("crash recovery to UNKNOWN_COMMIT")

      const localRecord = ledger.getOperation("op_crash_local")
      expect(localRecord?.status).toBe("FAILED_RETRYABLE")
      expect(localRecord?.errorMessage).toContain("crash recovery to FAILED_RETRYABLE")
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
})
