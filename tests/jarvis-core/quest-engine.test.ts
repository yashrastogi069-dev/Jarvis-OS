/**
 * JARVIS CORE V2 — QUEST ENGINE TEST SUITE
 * 
 * Checkpoint C8: Validates persisted quest creation, step lifecycle transitions,
 * dependency DAG enforcement, error retry budget, cancellation, suspension,
 * crash recovery, and operation ledger linkage in SQLite.
 */

import { describe, it, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"
import {
  QuestEngine,
  asQuestId,
  asStepId,
} from "../../lib/jarvis-core/quest"
import { OperationLedger } from "../../lib/jarvis-core/ledger"
import { asCapabilityId } from "../../lib/jarvis-core/types"

describe("JARVIS CORE V2 — Persisted Quest Engine (C8)", () => {
  let db: Database.Database
  let questEngine: QuestEngine
  let operationLedger: OperationLedger

  beforeEach(() => {
    db = new Database(":memory:")
    questEngine = new QuestEngine(db)
    operationLedger = new OperationLedger(db)
  })

  describe("Quest Creation & Plan Initialization", () => {
    it("creates a persistent quest without initial steps", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_001",
        title: "Organize my morning schedule",
        prompt: "Check my email and create tasks for today",
        metadata: { priority: "high" },
      })

      expect(quest.questId).toBeDefined()
      expect(quest.status).toBe("RUNNING")
      expect(quest.sessionId).toBe("sess_001")
      expect(quest.title).toBe("Organize my morning schedule")
      expect(quest.metadata).toEqual({ priority: "high" })
      expect(quest.steps).toHaveLength(0)

      const fetched = questEngine.getQuest(quest.questId)
      expect(fetched).not.toBeNull()
      expect(fetched?.questId).toBe(quest.questId)
      expect(fetched?.status).toBe("RUNNING")
    })

    it("creates a quest with atomic initial planned steps", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_002",
        title: "Morning Routine Multi-Step Quest",
        prompt: "Fetch emails then create a calendar event",
        steps: [
          {
            title: "Check unread emails",
            capabilityId: asCapabilityId("google.mail.messages.list"),
            inputPayload: { query: "is:unread" },
          },
          {
            title: "Create summary note in Obsidian",
            capabilityId: asCapabilityId("obsidian.notes.create"),
            inputPayload: { title: "Daily Digest" },
          },
        ],
      })

      expect(quest.steps).toHaveLength(2)
      expect(quest.steps[0].title).toBe("Check unread emails")
      expect(quest.steps[0].status).toBe("PENDING")
      expect(quest.steps[0].stepIndex).toBe(0)
      expect(quest.steps[1].title).toBe("Create summary note in Obsidian")
      expect(quest.steps[1].stepIndex).toBe(1)
    })
  })

  describe("Step Addition & Sequential Indexing", () => {
    it("appends new steps with correct stepIndex", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_003",
        title: "Dynamic Step Quest",
        prompt: "Step 1 initially",
        steps: [
          {
            title: "Step 1",
            capabilityId: asCapabilityId("tasks.list"),
          },
        ],
      })

      const step2 = questEngine.addStep(quest.questId, {
        title: "Step 2 added dynamically",
        capabilityId: asCapabilityId("tasks.create"),
        inputPayload: { title: "Follow up" },
      })

      expect(step2.stepIndex).toBe(1)
      expect(step2.status).toBe("PENDING")

      const refreshed = questEngine.getQuest(quest.questId)
      expect(refreshed?.steps).toHaveLength(2)
      expect(refreshed?.steps[1].title).toBe("Step 2 added dynamically")
    })

    it("rejects adding steps to completed or cancelled quests", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_004",
        title: "Cancel Quest Test",
        prompt: "Will cancel",
      })

      questEngine.cancelQuest(quest.questId, "User requested cancel")

      expect(() => {
        questEngine.addStep(quest.questId, {
          title: "Impossible step",
          capabilityId: asCapabilityId("tasks.list"),
        })
      }).toThrow(/Cannot add step to terminated quest/)
    })
  })

  describe("Dependency Verification & DAG Execution", () => {
    it("blocks starting a step when prerequisite dependency has not succeeded", () => {
      const step1Id = asStepId("step_dep_1")
      const step2Id = asStepId("step_dep_2")

      const quest = questEngine.createQuest({
        sessionId: "sess_005",
        title: "Dependency Test Quest",
        prompt: "Step 2 depends on Step 1",
        steps: [
          {
            stepId: step1Id,
            title: "Prerequisite Step",
            capabilityId: asCapabilityId("tasks.list"),
          },
          {
            stepId: step2Id,
            title: "Dependent Step",
            capabilityId: asCapabilityId("tasks.create"),
            dependencies: [step1Id],
          },
        ],
      })

      // Attempting to start step2 while step1 is PENDING must fail
      expect(() => {
        questEngine.startStep(step2Id)
      }).toThrow(/prerequisite dependency "step_dep_1" is not SUCCEEDED/)

      // Start and complete step 1
      questEngine.startStep(step1Id)
      questEngine.completeStep(step1Id, { count: 3 })

      // Now step 2 can start cleanly
      const runningStep2 = questEngine.startStep(step2Id)
      expect(runningStep2.status).toBe("RUNNING")
    })
  })

  describe("Quest Completion Lifecycle", () => {
    it("automatically completes quest when all steps have succeeded", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_006",
        title: "Auto Completion Quest",
        prompt: "Two steps to complete",
        steps: [
          {
            title: "Step A",
            capabilityId: asCapabilityId("tasks.create"),
          },
          {
            title: "Step B",
            capabilityId: asCapabilityId("memory.save"),
          },
        ],
      })

      const stepA = quest.steps[0]
      const stepB = quest.steps[1]

      questEngine.startStep(stepA.stepId)
      questEngine.completeStep(stepA.stepId, { id: "task_1" })

      // Quest still RUNNING because step B is pending
      let currentQuest = questEngine.getQuest(quest.questId)
      expect(currentQuest?.status).toBe("RUNNING")
      expect(currentQuest?.completedAt).toBeNull()

      questEngine.startStep(stepB.stepId)
      questEngine.completeStep(stepB.stepId, { id: "mem_1" })

      // Now all steps complete -> quest is SUCCEEDED
      currentQuest = questEngine.getQuest(quest.questId)
      expect(currentQuest?.status).toBe("SUCCEEDED")
      expect(currentQuest?.completedAt).toBeGreaterThan(0)
    })
  })

  describe("Step Failure & Retry Budget", () => {
    it("retries a retryable step within its maxRetries budget", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_007",
        title: "Retry Budget Test",
        prompt: "Will fail once and retry",
        steps: [
          {
            title: "Flaky Step",
            capabilityId: asCapabilityId("research.web_search"),
            maxRetries: 2,
          },
        ],
      })

      const step = quest.steps[0]
      questEngine.startStep(step.stepId)

      // First failure -> resets to PENDING for retry, retryCount increments to 1
      const retriedStep = questEngine.failStep(
        step.stepId,
        "TIMEOUT",
        "Network timed out",
        true
      )
      expect(retriedStep.status).toBe("PENDING")
      expect(retriedStep.retryCount).toBe(1)
      expect(retriedStep.errorCode).toBe("TIMEOUT")

      const currentQuest = questEngine.getQuest(quest.questId)
      expect(currentQuest?.status).toBe("RUNNING") // quest not failed yet
    })

    it("fails step and whole quest when maxRetries are exhausted", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_008",
        title: "Exhausted Retries Test",
        prompt: "Step will fail permanently",
        steps: [
          {
            title: "Terminal Failure Step",
            capabilityId: asCapabilityId("google.mail.messages.send"),
            maxRetries: 1,
          },
        ],
      })

      const step = quest.steps[0]

      // 1st attempt: fail
      questEngine.startStep(step.stepId)
      questEngine.failStep(step.stepId, "AUTH_ERROR", "Token expired", true)

      // 2nd attempt (retry 1 of 1): fail permanently
      questEngine.startStep(step.stepId)
      const finalFailedStep = questEngine.failStep(
        step.stepId,
        "AUTH_ERROR",
        "Token expired again",
        true
      )

      expect(finalFailedStep.status).toBe("FAILED")
      expect(finalFailedStep.completedAt).toBeGreaterThan(0)

      const failedQuest = questEngine.getQuest(quest.questId)
      expect(failedQuest?.status).toBe("FAILED")
      expect(failedQuest?.errorMessage).toContain("Step \"Terminal Failure Step\" failed")
    })
  })

  describe("Quest Cancellation & Suspension", () => {
    it("cancels quest and marks pending steps as SKIPPED", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_009",
        title: "Cancel Test",
        prompt: "Cancel me",
        steps: [
          { title: "Step 1", capabilityId: asCapabilityId("tasks.list") },
          { title: "Step 2", capabilityId: asCapabilityId("tasks.create") },
        ],
      })

      questEngine.cancelQuest(quest.questId, "User aborted goal")

      const cancelledQuest = questEngine.getQuest(quest.questId)
      expect(cancelledQuest?.status).toBe("CANCELLED")
      expect(cancelledQuest?.resultSummary).toBe("User aborted goal")
      expect(cancelledQuest?.steps[0].status).toBe("SKIPPED")
      expect(cancelledQuest?.steps[1].status).toBe("SKIPPED")
    })

    it("suspends and resumes a quest", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_010",
        title: "Suspend Resume Test",
        prompt: "Needs user confirmation",
      })

      const suspended = questEngine.suspendQuest(
        quest.questId,
        "Awaiting confirmation token"
      )
      expect(suspended.status).toBe("SUSPENDED")

      const resumed = questEngine.resumeQuest(quest.questId)
      expect(resumed.status).toBe("RUNNING")
    })
  })

  describe("Crash Recovery & Restart Survival", () => {
    it("safely recovers orphaned RUNNING quests and steps on process restart", () => {
      // 1. Create a quest and leave a step in RUNNING state (simulating abrupt crash)
      const quest = questEngine.createQuest({
        sessionId: "sess_crash",
        title: "Crashed Mid-Flight Quest",
        prompt: "Was running when power cut",
        steps: [
          {
            title: "Interrupted Step",
            capabilityId: asCapabilityId("obsidian.notes.append"),
          },
        ],
      })

      const step = quest.steps[0]
      questEngine.startStep(step.stepId)

      // 2. Simulate server reboot with new QuestEngine instance pointing to same DB
      const rebootEngine = new QuestEngine(db)
      const summary = rebootEngine.recoverCrashedQuests()

      expect(summary.recoveredQuests).toBe(1)
      expect(summary.suspendedQuests).toBe(1)
      expect(summary.recoveredSteps).toBe(1)

      // 3. Verify state post-reboot
      const recoveredQuest = rebootEngine.getQuest(quest.questId)
      expect(recoveredQuest?.status).toBe("SUSPENDED")
      expect(recoveredQuest?.errorMessage).toContain("Process restarted")
      expect(recoveredQuest?.steps[0].status).toBe("PENDING")
      expect(recoveredQuest?.steps[0].errorCode).toBe("CRASH_RECOVERED")
    })
  })

  describe("Operation Ledger Linkage", () => {
    it("links quest step to OperationLedger record", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_ledger",
        title: "Ledger-Linked Quest",
        prompt: "Mutating step linked to ledger",
        steps: [
          {
            title: "Create reminder task",
            capabilityId: asCapabilityId("tasks.create"),
            inputPayload: { title: "Buy milk" },
          },
        ],
      })

      const step = quest.steps[0]

      // Claim in OperationLedger with questId and stepId
      const claim = operationLedger.claimOperation({
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Buy milk" },
        questId: quest.questId,
        stepId: step.stepId,
      })

      expect(claim.status).toBe("CLAIMED")
      if (claim.status !== "CLAIMED") throw new Error("Expected CLAIMED")

      // Start step with operationId
      const runningStep = questEngine.startStep(step.stepId, claim.operationId)
      expect(runningStep.operationId).toBe(claim.operationId)

      // Complete both ledger operation and quest step
      operationLedger.completeOperation({
        operationId: claim.operationId,
        resultPayload: { id: "task_999" },
      })
      const completedStep = questEngine.completeStep(step.stepId, { id: "task_999" })

      expect(completedStep.status).toBe("SUCCEEDED")
      expect(completedStep.operationId).toBe(claim.operationId)
    })
  })

  describe("Secret Sanitization in Payloads", () => {
    it("redacts sensitive tokens in step input payloads", () => {
      const quest = questEngine.createQuest({
        sessionId: "sess_secrets",
        title: "Secret Redaction Quest",
        prompt: "Contains API token",
        steps: [
          {
            title: "Authenticated Request",
            capabilityId: asCapabilityId("github.issues.create"),
            inputPayload: {
              token: "ghp_super_secret_personal_access_token_12345",
              title: "Bug in auth",
            },
          },
        ],
      })

      const step = quest.steps[0]
      expect(step.inputPayload).toBeDefined()
      const payloadStr = JSON.stringify(step.inputPayload)
      expect(payloadStr).not.toContain("ghp_super_secret_personal_access_token_12345")
      expect(payloadStr).toContain("[REDACTED_GITHUB_TOKEN]")
    })
  })
})
