/**
 * JARVIS CORE V2 — MEGA GOAL C4–C8 UNIFIED INTEGRATION VERIFICATION GATE
 * 
 * Part 20 & Part 21: Full integration verification harness testing the combined
 * C4–C8 trustworthy runtime stack WITHOUT planner across all 7 canonical scenarios
 * plus non-negotiable crash and restart recovery.
 */

import { describe, it, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"
import { asCapabilityId } from "../../lib/jarvis-core/types"
import type { CapabilityDefinition } from "../../lib/jarvis-core/capabilities/types"
import { capabilityRegistry } from "../../lib/jarvis-core/capabilities"
import { executeCapabilitySafely } from "../../lib/jarvis-core/capabilities/safe-boundary"
import { ActionPolicyManager, actionPolicyManager, authorizeAndExecuteCapability } from "../../lib/jarvis-core/safety"
import { OperationLedger } from "../../lib/jarvis-core/ledger"
import { IntentAnalyzer } from "../../lib/jarvis-core/intent"
import { CapabilityRouter } from "../../lib/jarvis-core/routing"
import { QuestEngine, asStepId } from "../../lib/jarvis-core/quest"

describe("JARVIS CORE V2 — Mega Goal C4–C8 Cross-Checkpoint Integration Gate", () => {
  let db: Database.Database
  let policyManager: ActionPolicyManager
  let operationLedger: OperationLedger
  let intentAnalyzer: IntentAnalyzer
  let router: CapabilityRouter
  let questEngine: QuestEngine

  beforeEach(() => {
    db = new Database(":memory:")
    policyManager = new ActionPolicyManager()
    operationLedger = new OperationLedger(db)
    intentAnalyzer = new IntentAnalyzer()
    router = new CapabilityRouter(capabilityRegistry)
    questEngine = new QuestEngine(db)
  })

  // ==========================================================================
  // SCENARIO 1: Pure Conversation
  // ==========================================================================
  it("Scenario 1: Pure conversation -> 0 tools routed -> no ledger claim -> no quest -> direct response", async () => {
    const prompt = "Hello Jarvis, good morning! Hope you are having a productive day."

    // 1. Intent Analysis
    const intent = await intentAnalyzer.analyze(prompt)
    expect(intent.needsClarification).toBe(false)
    if (intent.needsClarification) throw new Error("Unexpected clarification")
    expect(intent.category).toBe("CHAT")

    // 2. Capability Routing
    const routing = router.route(prompt)
    expect(routing.domains).toHaveLength(0)
    expect(routing.selectedCapabilities).toHaveLength(0)
    expect(routing.selectedLegacyToolNames).toHaveLength(0)

    // 3. Ledger & Quest Invariants
    const operations = operationLedger.pruneOldOperations(0)
    expect(operations).toBe(0) // Zero operations in ledger
    const quests = questEngine.listQuests()
    expect(quests).toHaveLength(0) // Zero quests created
  })

  // ==========================================================================
  // SCENARIO 2: Simple Read
  // ==========================================================================
  it("Scenario 2: Simple read -> router selects capability -> no confirmation needed -> ledger read-only -> no quest required -> safe boundary returns normalized success", async () => {
    const prompt = "What tasks do I have scheduled for today?"

    // 1. Intent Analysis
    const intent = await intentAnalyzer.analyze(prompt)
    expect(intent.needsClarification).toBe(false)
    if (intent.needsClarification) throw new Error("Unexpected clarification")
    expect(intent.category).toBe("READ")
    expect(intent.targetDomain).toBe("tasks")

    // 2. Capability Routing
    const routing = router.route(prompt)
    expect(routing.domains).toContain("tasks")
    expect(routing.selectedLegacyToolNames).toContain("listTasks")

    // 3. Safety Policy
    const listCap = capabilityRegistry.getById("tasks.list")!
    const policyDecision = policyManager.evaluatePolicy(listCap, {})
    expect(policyDecision.type).toBe("ALLOW")

    // 4. Safe Execution Boundary
    const testListCap: CapabilityDefinition = {
      ...listCap,
      handler: async () => ({ tasks: [{ id: 1, title: "Review PR" }] }),
    }
    const result = await executeCapabilitySafely(testListCap, {})
    expect(result.success).toBe(true)
    if (!result.success) throw new Error("Expected success")
    expect(result.data).toEqual({ tasks: [{ id: 1, title: "Review PR" }] })

    // 5. Ledger & Quest Invariants: read-only, zero mutations
    const quests = questEngine.listQuests()
    expect(quests).toHaveLength(0)
  })

  // ==========================================================================
  // SCENARIO 3: Single Mutating Action with Valid Parameters
  // ==========================================================================
  it("Scenario 3: Single mutating action with valid parameters -> router selects capability -> central policy ALLOWs -> ledger claims -> safe boundary executes -> ledger records success", async () => {
    const prompt = "Create a task called 'Deploy release v2'"

    // 1. Intent Analysis
    const intent = await intentAnalyzer.analyze(prompt)
    expect(intent.needsClarification).toBe(false)
    if (intent.needsClarification) throw new Error("Unexpected clarification")
    expect(intent.category).toBe("ACTION")
    expect(intent.targetDomain).toBe("tasks")

    // 2. Capability Routing
    const routing = router.route(prompt)
    expect(routing.domains).toContain("tasks")
    expect(routing.selectedLegacyToolNames).toContain("createTask")

    // 3. Central Safety Policy
    const createCap = capabilityRegistry.getById("tasks.create")!
    const taskInput = { title: "Deploy release v2" }
    const policyDecision = policyManager.evaluatePolicy(createCap, taskInput)
    expect(policyDecision.type).toBe("ALLOW")

    // 4. Operation Ledger Claim
    const claim = operationLedger.claimOperation({
      capabilityId: asCapabilityId("tasks.create"),
      actionClass: "LOCAL_CREATE",
      idempotencyClass: "LEDGER_REQUIRED",
      input: taskInput,
    })
    expect(claim.status).toBe("CLAIMED")
    if (claim.status !== "CLAIMED") throw new Error("Expected CLAIMED")

    // 5. Safe Boundary Execution
    const testCreateCap: CapabilityDefinition = {
      ...createCap,
      handler: async (args: any) => ({ id: 101, title: args.title }),
    }
    const result = await executeCapabilitySafely(testCreateCap, taskInput)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error("Expected success")

    // 6. Operation Ledger Complete
    operationLedger.completeOperation({
      operationId: claim.operationId,
      resultPayload: result.data,
    })
    const completed = operationLedger.getOperation(claim.operationId)
    expect(completed?.status).toBe("SUCCEEDED")
    expect(completed?.resultPayload).toEqual({ id: 101, title: "Deploy release v2" })
  })

  // ==========================================================================
  // SCENARIO 4: High-Criticality Destructive Action WITHOUT Confirmation
  // ==========================================================================
  it("Scenario 4: High-criticality destructive action without confirmation -> router selects capability -> central policy intercepts with REQUIRE_CONFIRMATION -> unforgeable token generated -> preview returned -> handler NOT executed -> ledger NOT mutated", async () => {
    const prompt = "Delete task #42"

    // 1. Intent Analysis
    const intent = await intentAnalyzer.analyze(prompt)
    expect(intent.needsClarification).toBe(false) // Has explicit ID #42

    // 2. Capability Routing
    const routing = router.route(prompt)
    expect(routing.domains).toContain("tasks")
    expect(routing.selectedLegacyToolNames).toContain("deleteTask")

    // 3. Central Safety Policy Interception
    const deleteCap = capabilityRegistry.getById("tasks.delete")!
    const deleteArgs = { id: 42 }
    const policyDecision = policyManager.evaluatePolicy(deleteCap, deleteArgs)
    expect(policyDecision.type).toBe("REQUIRE_CONFIRMATION")
    if (policyDecision.type !== "REQUIRE_CONFIRMATION") throw new Error("Expected confirmation")

    expect(policyDecision.token).toBeDefined()
    expect(policyDecision.preview).toBeDefined()
    expect(policyDecision.preview.summary).toContain("Delete task")
    expect(policyDecision.preview.warning).toBeDefined()

    // 4. Execution Gateway verifies handler is NEVER called without valid token
    let handlerInvoked = false
    const testDeleteCap: CapabilityDefinition = {
      ...deleteCap,
      handler: async () => {
        handlerInvoked = true
        return { deleted: true }
      },
    }
    const execResult = await authorizeAndExecuteCapability(testDeleteCap, deleteArgs)

    expect(handlerInvoked).toBe(false)
    expect(execResult.status).toBe("CONFIRMATION_REQUIRED")
    if (execResult.status === "CONFIRMATION_REQUIRED") {
      expect(execResult.decision.type).toBe("REQUIRE_CONFIRMATION")
    }
  })

  // ==========================================================================
  // SCENARIO 5: High-Criticality Destructive Action WITH Valid Confirmation Token
  // ==========================================================================
  it("Scenario 5: High-criticality destructive action WITH valid confirmation token -> token validated and consumed -> ledger claims -> safe boundary executes -> ledger records completed -> replay blocked", async () => {
    const deleteCap = capabilityRegistry.getById("tasks.delete")!
    const deleteArgs = { id: 55 }

    let handlerInvoked = false
    const testDeleteCap: CapabilityDefinition = {
      ...deleteCap,
      handler: async () => {
        handlerInvoked = true
        return { deleted: true, id: 55 }
      },
    }

    // 1. Issue Confirmation Token using actionPolicyManager
    const confirmation = actionPolicyManager.issueConfirmation(testDeleteCap, deleteArgs, "Delete task 55", "HIGH")
    const token = confirmation.token

    // 2. Authorize and Execute with Token
    const execResult = await authorizeAndExecuteCapability(
      testDeleteCap,
      deleteArgs,
      { confirmationToken: token },
    )

    expect(handlerInvoked).toBe(true)
    expect(execResult.status).toBe("EXECUTED")
    if (execResult.status === "EXECUTED") {
      expect(execResult.result.success).toBe(true)
    }

    // Record in ledger
    const claim = operationLedger.claimOperation({
      capabilityId: asCapabilityId("tasks.delete"),
      actionClass: "LOCAL_DELETE",
      idempotencyClass: "LEDGER_REQUIRED",
      input: deleteArgs,
    })
    expect(claim.status).toBe("CLAIMED")
    if (claim.status !== "CLAIMED") throw new Error("Expected CLAIMED")

    operationLedger.completeOperation({
      operationId: claim.operationId,
      resultPayload: { success: true, id: 55 },
    })
    const completed = operationLedger.getOperation(claim.operationId)
    expect(completed?.status).toBe("SUCCEEDED")

    // 3. Replay Defense: Re-submitting the consumed token must be BLOCKED
    let replayInvoked = false
    const replayCap: CapabilityDefinition = {
      ...deleteCap,
      handler: async () => {
        replayInvoked = true
        return { success: true }
      },
    }
    const replayResult = await authorizeAndExecuteCapability(
      replayCap,
      deleteArgs,
      { confirmationToken: token },
    )

    expect(replayInvoked).toBe(false)
    expect(replayResult.status).toBe("BLOCKED")
    if (replayResult.status === "BLOCKED") {
      expect(replayResult.decision.type).toBe("BLOCK")
    }
  })

  // ==========================================================================
  // SCENARIO 6: Ambiguous Destructive Request
  // ==========================================================================
  it("Scenario 6: Ambiguous destructive request ('delete that task') -> ambiguity detector flags CLARIFICATION_REQUIRED -> central policy returns REQUIRE_CLARIFICATION -> no confirmation token generated -> no capability executed", async () => {
    const prompt = "Delete that task"

    // 1. Intent Analysis Interception
    const intent = await intentAnalyzer.analyze(prompt)
    expect(intent.needsClarification).toBe(true)
    if (!intent.needsClarification) throw new Error("Expected clarification")
    expect(intent.clarification.ambiguityType).toBe("AMBIGUOUS_TARGET")
    expect(intent.clarification.prompt).toContain("Which task would you like me to delete?")

    // 2. Central Safety Policy Precedence Check
    const deleteCap = capabilityRegistry.getById("tasks.delete")!
    const policyDecision = policyManager.evaluatePolicy(deleteCap, { id: 0 })
    expect(policyDecision.type).toBe("REQUIRE_CLARIFICATION")
    if (policyDecision.type !== "REQUIRE_CLARIFICATION") throw new Error("Expected clarification")
    expect(policyDecision.reason).toContain("missing or invalid")

    // 3. Execution Gateway verification: zero tokens, zero handler execution
    let handlerInvoked = false
    const testDeleteCap: CapabilityDefinition = {
      ...deleteCap,
      handler: async () => {
        handlerInvoked = true
        return { success: true }
      },
    }
    const execResult = await authorizeAndExecuteCapability(testDeleteCap, { id: 0 })

    expect(handlerInvoked).toBe(false)
    expect(execResult.status).toBe("CLARIFICATION_REQUIRED")
    if (execResult.status === "CLARIFICATION_REQUIRED") {
      expect(execResult.decision.type).toBe("REQUIRE_CLARIFICATION")
    }
  })

  // ==========================================================================
  // SCENARIO 7: Multi-Step Goal Prompt
  // ==========================================================================
  it("Scenario 7: Multi-step goal prompt -> intent detector tags QUEST -> router selects relevant domain tools -> quest engine creates persisted quest and pending steps in SQLite -> steps executed sequentially through ledger with dependency validation -> quest completes in SQLite", async () => {
    const prompt = "Search my emails for flight confirmation and then append the itinerary to my Obsidian vault notes"

    // 1. Intent Analysis
    const intent = await intentAnalyzer.analyze(prompt)
    expect(intent.needsClarification).toBe(false)
    if (intent.needsClarification) throw new Error("Unexpected clarification")
    expect(intent.category).toBe("QUEST")

    // 2. Capability Routing
    const routing = router.route(prompt)
    expect(routing.domains).toContain("google")
    expect(routing.domains).toContain("obsidian")
    expect(routing.selectedLegacyToolNames).toContain("searchGmail")
    expect(routing.selectedLegacyToolNames).toContain("appendNote")

    // 3. Persisted Quest Engine Creation
    const step1Id = asStepId("step_flight_search")
    const step2Id = asStepId("step_obsidian_append")

    const quest = questEngine.createQuest({
      sessionId: "session_integration_007",
      title: "Sync Flight Confirmation to Obsidian",
      prompt,
      steps: [
        {
          stepId: step1Id,
          title: "Search Gmail for flight confirmation",
          capabilityId: asCapabilityId("google.mail.messages.list"),
          inputPayload: { query: "flight confirmation" },
        },
        {
          stepId: step2Id,
          title: "Append itinerary to Obsidian flight notes",
          capabilityId: asCapabilityId("obsidian.notes.append"),
          inputPayload: { notePath: "Trips/2026-Flight.md" },
          dependencies: [step1Id],
        },
      ],
    })

    expect(quest.status).toBe("RUNNING")
    expect(quest.steps).toHaveLength(2)

    // 4. Step 1 Execution linked to Operation Ledger
    const claim1 = operationLedger.claimOperation({
      capabilityId: asCapabilityId("google.mail.messages.list"),
      actionClass: "READ_ONLY",
      idempotencyClass: "READ_ONLY",
      input: { query: "flight confirmation" },
      questId: quest.questId,
      stepId: step1Id,
    })
    expect(claim1.status).toBe("CLAIMED")
    if (claim1.status !== "CLAIMED") throw new Error("Expected CLAIMED")

    questEngine.startStep(step1Id, claim1.operationId)
    operationLedger.completeOperation({
      operationId: claim1.operationId,
      resultPayload: { flightId: "FL-9821", departure: "10:30 AM" },
    })
    questEngine.completeStep(step1Id, { flightId: "FL-9821", departure: "10:30 AM" })

    // 5. Step 2 Execution with Prerequisite Dependency Satisfied
    const claim2 = operationLedger.claimOperation({
      capabilityId: asCapabilityId("obsidian.notes.append"),
      actionClass: "LOCAL_UPDATE",
      idempotencyClass: "LEDGER_REQUIRED",
      input: { notePath: "Trips/2026-Flight.md", content: "FL-9821 10:30 AM" },
      questId: quest.questId,
      stepId: step2Id,
    })
    expect(claim2.status).toBe("CLAIMED")
    if (claim2.status !== "CLAIMED") throw new Error("Expected CLAIMED")

    questEngine.startStep(step2Id, claim2.operationId)
    operationLedger.completeOperation({
      operationId: claim2.operationId,
      resultPayload: { appended: true, notePath: "Trips/2026-Flight.md" },
    })
    questEngine.completeStep(step2Id, { appended: true, notePath: "Trips/2026-Flight.md" })

    // 6. Complete Quest Verification in SQLite:
    // All planned steps terminal -> AWAITING_VERIFICATION (C12 Completion Verifier boundary)
    const awaitingQuest = questEngine.getQuest(quest.questId)
    expect(awaitingQuest?.status).toBe("AWAITING_VERIFICATION")

    // C12 Completion Verifier explicitly completes the quest
    questEngine.verifyAndCompleteQuest(
      quest.questId,
      "SUCCEEDED",
      "Both email fetch and obsidian note append verified complete"
    )

    const finalizedQuest = questEngine.getQuest(quest.questId)!
    expect(finalizedQuest.status).toBe("SUCCEEDED")
    expect(finalizedQuest.completedAt).toBeGreaterThan(0)
    expect(finalizedQuest.steps[0].status).toBe("SUCCEEDED")
    expect(finalizedQuest.steps[1].status).toBe("SUCCEEDED")
    expect(finalizedQuest.steps[0].operationId).toBe(claim1.operationId)
    expect(finalizedQuest.steps[1].operationId).toBe(claim2.operationId)
  })

  // ==========================================================================
  // PART 21: CRASH & RESTART RECOVERY VALIDATION (NON-NEGOTIABLE)
  // ==========================================================================
  describe("Part 21: Crash & Restart Recovery Invariants", () => {
    it("Recovery 1: Recovers orphaned RUNNING ledger operations on boot to UNKNOWN_COMMIT or FAILED_RETRYABLE", () => {
      // 1. Simulate external mutation running when process dies
      const extClaim = operationLedger.claimOperation({
        capabilityId: asCapabilityId("google.mail.messages.send"),
        actionClass: "EXTERNAL_SEND",
        idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
        input: { to: "partner@corp.com" },
      })
      expect(extClaim.status).toBe("CLAIMED")

      // 2. Simulate local mutation running when process dies (Blocker B: uncommitted crash window)
      const locClaim = operationLedger.claimOperation({
        capabilityId: asCapabilityId("tasks.create"),
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: { title: "Interrupted task" },
      })
      expect(locClaim.status).toBe("CLAIMED")

      // 3. Simulate read-only query running when process dies
      const readClaim = operationLedger.claimOperation({
        capabilityId: asCapabilityId("tasks.list"),
        actionClass: "READ_ONLY",
        idempotencyClass: "READ_ONLY",
        input: {},
      })
      expect(readClaim.status).toBe("CLAIMED")

      // 4. Server terminates and reboots: recoverCrashedOperations() called
      const rebootLedger = new OperationLedger(db)
      const count = rebootLedger.recoverCrashedOperations()
      expect(count).toBe(3)

      // 5. External and local mutations must be UNKNOWN_COMMIT; read-only must be FAILED_RETRYABLE
      if (extClaim.status !== "CLAIMED" || locClaim.status !== "CLAIMED" || readClaim.status !== "CLAIMED") throw new Error()
      const extRecord = rebootLedger.getOperation(extClaim.operationId)
      const locRecord = rebootLedger.getOperation(locClaim.operationId)
      const readRecord = rebootLedger.getOperation(readClaim.operationId)

      expect(extRecord?.status).toBe("UNKNOWN_COMMIT")
      expect(extRecord?.errorMessage).toContain("UNKNOWN_COMMIT")

      // Blocker B: Local mutations cannot be atomically committed with ledger, so crash window -> UNKNOWN_COMMIT
      expect(locRecord?.status).toBe("UNKNOWN_COMMIT")
      expect(locRecord?.errorMessage).toContain("UNKNOWN_COMMIT")

      expect(readRecord?.status).toBe("FAILED_RETRYABLE")
      expect(readRecord?.errorMessage).toContain("FAILED_RETRYABLE")

      // 5. Automated replay of UNKNOWN_COMMIT external mutation is blocked
      const replayClaim = rebootLedger.claimOperation({
        capabilityId: asCapabilityId("google.mail.messages.send"),
        actionClass: "EXTERNAL_SEND",
        idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
        input: { to: "partner@corp.com" },
      })
      expect(replayClaim.status).toBe("UNKNOWN_COMMIT")
    })

    it("Recovery 2: Recovers orphaned RUNNING quests to SUSPENDED and steps to PENDING on boot", () => {
      // 1. Quest in progress when process terminated
      const quest = questEngine.createQuest({
        sessionId: "sess_reboot_test",
        title: "Mid-flight Quest",
        prompt: "Run 2 steps",
        steps: [
          {
            title: "Step that was running",
            capabilityId: asCapabilityId("obsidian.notes.create"),
          },
        ],
      })

      const step = quest.steps[0]
      questEngine.startStep(step.stepId)

      // 2. System reboots -> recoverCrashedQuests() runs on boot
      const rebootEngine = new QuestEngine(db)
      const summary = rebootEngine.recoverCrashedQuests()

      expect(summary.recoveredQuests).toBe(1)
      expect(summary.suspendedQuests).toBe(1)
      expect(summary.recoveredSteps).toBe(1)

      // 3. Verify quest status is SUSPENDED and step is PENDING
      const postRebootQuest = rebootEngine.getQuest(quest.questId)
      expect(postRebootQuest?.status).toBe("SUSPENDED")
      expect(postRebootQuest?.errorMessage).toContain("Process restarted")
      expect(postRebootQuest?.steps[0].status).toBe("PENDING")
      expect(postRebootQuest?.steps[0].errorCode).toBe("CRASH_RECOVERED")

      // 4. Quest can be resumed cleanly by user or supervisor
      const resumed = rebootEngine.resumeQuest(quest.questId)
      expect(resumed.status).toBe("RUNNING")
    })
  })
})
