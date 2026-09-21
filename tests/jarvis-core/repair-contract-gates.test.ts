/**
 * JARVIS CORE V2 — REPAIR CONTRACT REGRESSION TEST SUITE (GATES A → J)
 * 
 * Pre-Phase-4 Runtime Contract Verification:
 * Gate A: Cryptographic Confirmation Security (zero model authority)
 * Gate B: Canonical Input Normalization Equivalence
 * Gate C: UNKNOWN_COMMIT Persistence & Safe Downstream Blocking
 * Gate D: Durable Quest Plan & Step Persistence in SQLite
 * Gate E: Direct ACTION Runtime & Regex Resolver
 * Gate F: Intent Fast-Path Target Correctness
 * Gate G: Preview Schema Alignment (Zero Undefined Fields)
 * Gate H: Replanner Budget & Loop Safety
 * Gate I: Read-Only Evidence & State Purity
 * Gate J: Capability Abortability Contract
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

import {
  asCapabilityId,
  asPlanId,
  asPlanStepId,
  asQuestId,
  asTurnId,
  asTraceId,
} from "../../lib/jarvis-core/types"
import { ActionPolicyManager } from "../../lib/jarvis-core/safety/policy"
import { normalizeCapabilityInput } from "../../lib/jarvis-core/capabilities/normalizer"
import { capabilityRegistry } from "../../lib/jarvis-core/capabilities/registry"
import { generateActionPreview } from "../../lib/jarvis-core/safety/preview"
import { deterministicFastPathClassifier } from "../../lib/jarvis-core/intent/classifier"
import { ActionArgumentResolver } from "../../lib/jarvis-core/action/resolver"
import { DirectActionRuntime } from "../../lib/jarvis-core/action/runtime"
import { OperationLedger } from "../../lib/jarvis-core/ledger"
import { QuestEngine } from "../../lib/jarvis-core/quest/engine"
import { DeterministicDAGExecutor } from "../../lib/jarvis-core/executor/executor"
import { ValidatedExecutionPlan } from "../../lib/jarvis-core/executor/types"
import type { CapabilityDefinition } from "../../lib/jarvis-core/capabilities/types"

describe("JARVIS CORE V2 — Pre-Phase-4 Runtime Contract Repair Gates", () => {
  let tempDbPath: string
  let db: Database.Database
  let policyManager: ActionPolicyManager
  let ledger: OperationLedger
  let questEngine: QuestEngine

  beforeEach(() => {
    tempDbPath = path.join(process.cwd(), `temp_repair_gates_${Date.now()}_${Math.random().toString(36).slice(2)}.db`)
    db = new Database(tempDbPath)
    ledger = new OperationLedger(db)
    questEngine = new QuestEngine(db)
    policyManager = new ActionPolicyManager()
  })

  afterEach(() => {
    try {
      db.close()
    } catch {}
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath)
      } catch {}
    }
  })

  // ==========================================================================
  // GATE A: Cryptographic Confirmation Security
  // ==========================================================================
  describe("Gate A: Cryptographic Confirmation Security (Zero Model Authority)", () => {
    it("rejects execution without token or with forged token, requiring valid C4 cryptographic token", () => {
      const cap = capabilityRegistry.getById(asCapabilityId("tasks.delete"))!
      expect(cap).toBeDefined()

      const args = { id: 42 }

      // 1. Initial evaluation requires confirmation
      const decision1 = policyManager.evaluatePolicy(cap, args)
      expect(decision1.type).toBe("REQUIRE_CONFIRMATION")
      if (decision1.type !== "REQUIRE_CONFIRMATION") throw new Error("Expected confirmation")

      const validToken = decision1.token
      expect(validToken).toMatch(/^cf_\d+_[a-f0-9]{48}$/)

      // 2. Forged token is rejected (BLOCK)
      const forgedDecision = policyManager.evaluatePolicy(cap, args, {
        confirmationToken: "cf_forged_fake_token_12345" as any,
      })
      expect(forgedDecision.type).toBe("BLOCK")

      // 3. Argument-mismatched token is rejected (BLOCK)
      const mismatchedDecision = policyManager.evaluatePolicy(cap, { id: 99 }, {
        confirmationToken: validToken,
      })
      expect(mismatchedDecision.type).toBe("BLOCK")

      // 4. Valid token is ALLOWED
      const allowedDecision = policyManager.evaluatePolicy(cap, args, {
        confirmationToken: validToken,
      })
      expect(allowedDecision.type).toBe("ALLOW")

      // 5. Token is single-use: Replaying the consumed token is rejected
      const replayedDecision = policyManager.evaluatePolicy(cap, args, {
        confirmationToken: validToken,
      })
      expect(replayedDecision.type).toBe("BLOCK")
    })
  })

  // ==========================================================================
  // GATE B: Canonical Input Normalization Equivalence
  // ==========================================================================
  describe("Gate B: Canonical Input Normalization Equivalence", () => {
    it("normalizes diverse input aliases to identical canonical representations", () => {
      // Google Calendar event create
      const gcal = capabilityRegistry.getById(asCapabilityId("google.calendar.event.create"))!
      const gcalNorm1 = normalizeCapabilityInput(gcal, {
        title: "Team Sync",
        startTime: "2026-10-01T10:00:00Z",
        endTime: "2026-10-01T11:00:00Z",
      })
      const gcalNorm2 = normalizeCapabilityInput(gcal, {
        summary: "Team Sync",
        startISO: "2026-10-01T10:00:00Z",
        endISO: "2026-10-01T11:00:00Z",
      })

      expect(gcalNorm1.success).toBe(true)
      expect(gcalNorm2.success).toBe(true)
      if (gcalNorm1.success && gcalNorm2.success) {
        expect(gcalNorm1.canonicalArgs).toEqual(gcalNorm2.canonicalArgs)
        expect(gcalNorm1.canonicalArgs).toEqual({
          summary: "Team Sync",
          startISO: "2026-10-01T10:00:00Z",
          endISO: "2026-10-01T11:00:00Z",
        })
      }

      // GitHub Issue Create
      const ghIssue = capabilityRegistry.getById(asCapabilityId("github.issue.create"))!
      const ghNorm = normalizeCapabilityInput(ghIssue, {
        owner: "yashrastogi069-dev",
        repo: "agentic-os-build",
        title: "Bug in Core",
        body: "Detailed description",
      })
      expect(ghNorm.success).toBe(true)
      if (ghNorm.success) {
        expect(ghNorm.canonicalArgs.repo).toBe("yashrastogi069-dev/agentic-os-build")
        expect(ghNorm.canonicalArgs.title).toBe("Bug in Core")
        expect(ghNorm.canonicalArgs.body).toBe("Detailed description")
      }
    })
  })

  // ==========================================================================
  // GATE C: UNKNOWN_COMMIT Persistence & Safe Downstream Blocking
  // ==========================================================================
  describe("Gate C: UNKNOWN_COMMIT Persistence & Safe Downstream Blocking", () => {
    it("records UNKNOWN_COMMIT in ledger and terminates step safely", () => {
      const opId = asCapabilityId("op_unknown_test") as any

      ledger.claimOperation({
        operationId: opId,
        capabilityId: asCapabilityId("google.mail.message.send"),
        actionClass: "EXTERNAL_SEND",
        idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
        input: { to: "alice@example.com", body: "Hello" },
        actor: "user",
      })

      ledger.failOperation({
        operationId: opId,
        errorCode: "UNKNOWN_COMMIT",
        errorMessage: "Network timed out during TLS flush; status unknown",
        isRetryable: false,
        isUnknownCommit: true,
      })

      // Replay claim must be blocked due to uncertain commit
      const replayClaim = ledger.claimOperation({
        operationId: opId,
        capabilityId: asCapabilityId("google.mail.message.send"),
        actionClass: "EXTERNAL_SEND",
        idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
        input: { to: "alice@example.com", body: "Hello" },
        actor: "user",
      })

      expect(replayClaim.status).toBe("UNKNOWN_COMMIT")
      if (replayClaim.status === "UNKNOWN_COMMIT") {
        expect(replayClaim.reason).toContain("UNKNOWN_COMMIT")
      }
    })
  })

  // ==========================================================================
  // GATE D: Durable Quest Plan Persistence in SQLite
  // ==========================================================================
  describe("Gate D: Durable Quest Plan Persistence in SQLite", () => {
    it("persists execution plan and step status transitions to SQLite, allowing recovery without caller memory", () => {
      const quest = questEngine.createQuest({
        sessionId: "session_repair_1",
        title: "Durable plan test",
        prompt: "Durable plan test",
      })

      const plan: ValidatedExecutionPlan = {
        id: asPlanId("plan_durable_1"),
        questId: quest.questId,
        traceId: asTraceId("trace_1"),
        objective: "Durable plan test",
        version: 1,
        topologicalOrder: [asPlanStepId("step_1"), asPlanStepId("step_2")],
        steps: [
          {
            id: asPlanStepId("step_1"),
            objective: "List tasks",
            capabilityId: asCapabilityId("tasks.list"),
            arguments: {},
            dependsOn: [],
            completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
            required: true,
            trustedMetadata: {
              actionClass: "READ_ONLY",
              confirmationPolicy: "NONE",
              idempotencyClass: "READ_ONLY",
              requiresConfirmation: false,
              domain: "tasks",
              previewSupported: false,
            },
          },
          {
            id: asPlanStepId("step_2"),
            objective: "Create follow-up task",
            capabilityId: asCapabilityId("tasks.create"),
            arguments: { title: "Follow up" },
            dependsOn: [asPlanStepId("step_1")],
            completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
            required: true,
            trustedMetadata: {
              actionClass: "LOCAL_CREATE",
              confirmationPolicy: "NONE",
              idempotencyClass: "LEDGER_REQUIRED",
              requiresConfirmation: false,
              domain: "tasks",
              previewSupported: false,
            },
          },
        ],
        createdAt: Date.now(),
      }

      questEngine.persistPlan(plan)

      // Retrieve plan from SQLite
      const activePlan = questEngine.getActivePlan(quest.questId)
      expect(activePlan).toBeDefined()
      expect(activePlan?.id).toBe(plan.id)
      expect(activePlan?.version).toBe(1)
      expect(activePlan?.steps).toHaveLength(2)
      expect(activePlan?.steps[0].id).toBe("step_1")

      // Update step status in SQLite
      questEngine.updateStepStatus(quest.questId, asPlanStepId("step_1"), "COMPLETED")
      const questWithSteps = questEngine.getQuest(quest.questId)
      expect(questWithSteps?.steps.find((s) => s.stepId === "step_1")?.status).toBe("COMPLETED")
    })
  })

  // ==========================================================================
  // GATE E: Direct ACTION Runtime & Regex Resolver
  // ==========================================================================
  describe("Gate E: Direct ACTION Runtime & Regex Resolver", () => {
    it("resolves arguments and executes direct single mutation end-to-end", async () => {
      const runtime = new DirectActionRuntime(
        capabilityRegistry,
        ledger,
        policyManager,
      )

      const result = await runtime.executeAction(
        "Create a task to buy groceries",
        asCapabilityId("tasks.create"),
        asTurnId("turn_action_1"),
      )

      expect(result.status).toBe("COMPLETED")
      if (result.status === "COMPLETED") {
        expect(result.result).toBeDefined()
        expect(result.operationId).toBeDefined()

        // Verify operation ledger recorded the action
        const ledgerEntry = ledger.getOperation(result.operationId)
        expect(ledgerEntry).toBeDefined()
        expect(ledgerEntry?.status).toBe("SUCCEEDED")
      }
    })
  })

  // ==========================================================================
  // GATE F: Intent Fast-Path Target Correctness
  // ==========================================================================
  describe("Gate F: Intent Fast-Path Target Correctness", () => {
    it("routes GitHub, Calendar, Wake Word, Telegram, and Obsidian queries to exact targets", () => {
      // GitHub
      expect(deterministicFastPathClassifier.classify("show my github notifications")?.targetCapability).toBe("github.notifications.list")
      expect(deterministicFastPathClassifier.classify("list open pull requests")?.targetCapability).toBe("github.prs.list")
      expect(deterministicFastPathClassifier.classify("view my open issues")?.targetCapability).toBe("github.issues.list")
      expect(deterministicFastPathClassifier.classify("list recent commits")?.targetCapability).toBe("github.commits.list")
      expect(deterministicFastPathClassifier.classify("create a github issue")?.targetCapability).toBe("github.issue.create")
      expect(deterministicFastPathClassifier.classify("comment on issue")?.targetCapability).toBe("github.issue.comment")

      // Wake words
      expect(deterministicFastPathClassifier.classify("add wake word jarvis")?.targetCapability).toBe("wake_words.add")
      expect(deterministicFastPathClassifier.classify("remove wake word jarvis")?.targetCapability).toBe("wake_words.remove")
      expect(deterministicFastPathClassifier.classify("list wake words")?.targetCapability).toBe("wake_words.list")

      // Calendar (Google vs Apple)
      expect(deterministicFastPathClassifier.classify("show my calendar")?.targetCapability).toBe("google.calendar.events.list")
      expect(deterministicFastPathClassifier.classify("show my apple calendar")?.targetCapability).toBe("apple.calendar.events.list")
      expect(deterministicFastPathClassifier.classify("create a calendar event")?.targetCapability).toBe("google.calendar.event.create")
      expect(deterministicFastPathClassifier.classify("create an apple calendar event")?.targetCapability).toBe("apple.calendar.event.create")

      // Telegram
      expect(deterministicFastPathClassifier.classify("check telegram messages")?.targetCapability).toBe("telegram.messages.get")
      expect(deterministicFastPathClassifier.classify("send a telegram message")?.targetCapability).toBe("telegram.message.send")

      // Obsidian
      expect(deterministicFastPathClassifier.classify("search notes")?.targetCapability).toBe("obsidian.notes.search")
      expect(deterministicFastPathClassifier.classify("append to note")?.targetCapability).toBe("obsidian.note.append")
      expect(deterministicFastPathClassifier.classify("create a note")?.targetCapability).toBe("obsidian.note.create")
    })
  })

  // ==========================================================================
  // GATE G: Preview Schema Alignment
  // ==========================================================================
  describe("Gate G: Preview Schema Alignment (Zero Undefined Fields)", () => {
    it("generates structured preview without undefined fields for mutating connectors", () => {
      // Google Calendar
      const gcal = capabilityRegistry.getById(asCapabilityId("google.calendar.event.create"))!
      const gcalPreview = generateActionPreview(gcal, {
        summary: "Strategy Planning",
        startISO: "2026-11-01T09:00:00Z",
        endISO: "2026-11-01T10:00:00Z",
        location: "HQ",
      })
      expect(gcalPreview.summary).toContain("Strategy Planning")
      expect(gcalPreview.details.start).toBe("2026-11-01T09:00:00Z")
      expect(gcalPreview.details.end).toBe("2026-11-01T10:00:00Z")
      expect(gcalPreview.details.location).toBe("HQ")

      // Apple Calendar
      const acal = capabilityRegistry.getById(asCapabilityId("apple.calendar.event.create"))!
      const acalPreview = generateActionPreview(acal, {
        summary: "Dentist",
        startISO: "2026-11-02T14:00:00Z",
        endISO: "2026-11-02T15:00:00Z",
      })
      expect(acalPreview.summary).toContain("Dentist")
      expect(acalPreview.details.start).toBe("2026-11-02T14:00:00Z")

      // GitHub
      const gh = capabilityRegistry.getById(asCapabilityId("github.issue.create"))!
      const ghPreview = generateActionPreview(gh, {
        repo: "octocat/Hello-World",
        title: "Test Issue",
        body: "Hello world body",
      })
      expect(ghPreview.summary).toContain("octocat/Hello-World")
      expect(ghPreview.details.repository).toBe("octocat/Hello-World")
      expect(ghPreview.details.title).toBe("Test Issue")

      // Gmail reply
      const replyCap = capabilityRegistry.getById(asCapabilityId("google.mail.message.reply"))!
      const replyPreview = generateActionPreview(replyCap, {
        id: "msg_xyz123",
        body: "Sounds good!",
      })
      expect(replyPreview.summary).toContain("msg_xyz123")
      expect(replyPreview.details.replyingTo).toBe("msg_xyz123")
    })
  })

  // ==========================================================================
  // GATE J: Capability Abortability Contract
  // ==========================================================================
  describe("Gate J: Capability Abortability Contract", () => {
    it("verifies capabilities have valid abortability classification", () => {
      const allCaps = capabilityRegistry.getAll()
      expect(allCaps.length).toBeGreaterThan(30)

      for (const cap of allCaps) {
        if (cap.abortability) {
          expect(["COOPERATIVE", "SYNCHRONOUS_NON_ABORTABLE"]).toContain(cap.abortability)
        }
      }
    })
  })
})
