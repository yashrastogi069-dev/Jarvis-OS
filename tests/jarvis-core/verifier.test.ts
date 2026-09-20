/**
 * JARVIS CORE V2 — TERMINAL COMPLETION VERIFIER TEST SUITE
 * 
 * Checkpoint C12: Criteria evaluation, anti-premature-completion, goal resolution
 * (COMPLETED vs PARTIALLY_COMPLETED vs BLOCKED vs FAILED), and QuestEngine synchronization.
 */

import { describe, it, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"
import {
  TerminalCompletionVerifier,
  CriteriaEvaluator,
  type PlanVerificationResult,
} from "../../lib/jarvis-core/verifier"
import { OperationLedger } from "../../lib/jarvis-core/ledger"
import { QuestEngine, asStepId } from "../../lib/jarvis-core/quest"
import type { ValidatedExecutionPlan, ValidatedPlanStep } from "../../lib/jarvis-core/planner"
import type { ExecutionResult } from "../../lib/jarvis-core/executor"
import {
  asCapabilityId,
  asPlanId,
  asPlanStepId,
  asQuestId,
  asTraceId,
  type PlanStepId,
  type JsonValue,
} from "../../lib/jarvis-core/types"

describe("JARVIS CORE V2 — Terminal Completion Verifier (C12)", () => {
  let db: Database.Database
  let ledger: OperationLedger
  let questEngine: QuestEngine
  let verifier: TerminalCompletionVerifier

  beforeEach(() => {
    db = new Database(":memory:")
    ledger = new OperationLedger(db)
    questEngine = new QuestEngine(db)
    verifier = new TerminalCompletionVerifier(ledger, questEngine)
  })

  function makePlan(steps: ValidatedPlanStep[]): ValidatedExecutionPlan {
    return {
      id: asPlanId("plan_ver_001"),
      questId: asQuestId("quest_ver_001"),
      traceId: asTraceId("trace_ver_001"),
      objective: "Verify multi-step objective",
      version: 1,
      steps,
      createdAt: Date.now(),
      topologicalOrder: steps.map((s) => s.id),
    }
  }

  function makeStep(
    id: string,
    required = true,
    criteria: ValidatedPlanStep["completionCriteria"] = [{ type: "CAPABILITY_SUCCEEDED" }]
  ): ValidatedPlanStep {
    return {
      id: asPlanStepId(id),
      objective: `Subtask ${id}`,
      capabilityId: asCapabilityId("tasks.create"),
      arguments: { title: `Task ${id}` },
      dependsOn: [],
      completionCriteria: criteria,
      required,
      trustedMetadata: {
        actionClass: "LOCAL_CREATE",
        confirmationPolicy: "NONE",
        idempotencyClass: "LEDGER_REQUIRED",
        requiresConfirmation: false,
        domain: "tasks",
        previewSupported: true,
      },
    }
  }

  // ==========================================================================
  // 1. FULL GOAL RESOLUTION & SUCCESS
  // ==========================================================================
  describe("Full Goal Resolution (COMPLETED)", () => {
    it("verifies plan as COMPLETED when all steps and criteria succeed with ledger evidence", async () => {
      const step1 = makeStep("step_1", true, [{ type: "CAPABILITY_SUCCEEDED" }])
      const step2 = makeStep("step_2", true, [
        { type: "OUTPUT_PRESENT", path: "/createdId" },
      ])
      const plan = makePlan([step1, step2])

      // Seed ledger evidence
      const op1 = ledger.claimOperation({
        operationId: undefined,
        capabilityId: step1.capabilityId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: step1.arguments,
        questId: plan.questId,
        stepId: step1.id,
      })
      if (op1.status === "CLAIMED") {
        ledger.completeOperation({ operationId: op1.operationId, resultPayload: { ok: true } })
      }

      const op2 = ledger.claimOperation({
        operationId: undefined,
        capabilityId: step2.capabilityId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: step2.arguments,
        questId: plan.questId,
        stepId: step2.id,
      })
      if (op2.status === "CLAIMED") {
        ledger.completeOperation({ operationId: op2.operationId, resultPayload: { createdId: 42 } })
      }

      const execResult: ExecutionResult = {
        status: "AWAITING_VERIFICATION",
        questId: plan.questId,
        planId: plan.id,
        completedSteps: [step1.id, step2.id],
        failedSteps: [],
        blockedSteps: [],
        skippedSteps: [],
        stepResults: new Map<PlanStepId, JsonValue | null>([
          [step1.id, { ok: true }],
          [step2.id, { createdId: 42 }],
        ]),
        durationMs: 50,
      }

      const result = await verifier.verifyPlan(plan, execResult)

      expect(result.verified).toBe(true)
      expect(result.finalStatus).toBe("COMPLETED")
      expect(result.unfulfilledRequiredSteps.length).toBe(0)
      expect(result.summary).toContain("verified successfully")
    })
  })

  // ==========================================================================
  // 2. PARTIAL COMPLETION
  // ==========================================================================
  describe("Partial Goal Resolution (PARTIALLY_COMPLETED)", () => {
    it("resolves to PARTIALLY_COMPLETED when optional step is missing but all required steps succeeded", async () => {
      const stepReq = makeStep("step_req", true, [{ type: "CAPABILITY_SUCCEEDED" }])
      const stepOpt = makeStep("step_opt", false, [{ type: "CAPABILITY_SUCCEEDED" }])
      const plan = makePlan([stepReq, stepOpt])

      // Only stepReq succeeded
      const opReq = ledger.claimOperation({
        operationId: undefined,
        capabilityId: stepReq.capabilityId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: stepReq.arguments,
        questId: plan.questId,
        stepId: stepReq.id,
      })
      if (opReq.status === "CLAIMED") {
        ledger.completeOperation({ operationId: opReq.operationId, resultPayload: { ok: true } })
      }

      const execResult: ExecutionResult = {
        status: "AWAITING_VERIFICATION",
        questId: plan.questId,
        planId: plan.id,
        completedSteps: [stepReq.id],
        failedSteps: [stepOpt.id],
        blockedSteps: [],
        skippedSteps: [],
        stepResults: new Map([[stepReq.id, { ok: true }]]),
        durationMs: 40,
      }

      const result = await verifier.verifyPlan(plan, execResult)

      expect(result.verified).toBe(true) // Required steps satisfied
      expect(result.finalStatus).toBe("PARTIALLY_COMPLETED")
      expect(result.unfulfilledOptionalSteps).toContain(stepOpt.id)
      expect(result.summary).toContain("partially completed")
    })
  })

  // ==========================================================================
  // 3. ANTI-HALLUCINATION & ANTI-PREMATURE COMPLETION
  // ==========================================================================
  describe("Anti-Premature Completion & Criteria Enforcement", () => {
    it("rejects completion when expected output property is missing despite step execution", async () => {
      const step = makeStep("step_bad_output", true, [
        { type: "OUTPUT_PRESENT", path: "/expectedId" },
      ])
      const plan = makePlan([step])

      const execResult: ExecutionResult = {
        status: "AWAITING_VERIFICATION",
        questId: plan.questId,
        planId: plan.id,
        completedSteps: [step.id],
        failedSteps: [],
        blockedSteps: [],
        skippedSteps: [],
        stepResults: new Map([
          [step.id, { wrongKey: 123 }], // Missing expectedId!
        ]),
        durationMs: 30,
      }

      const result = await verifier.verifyPlan(plan, execResult)

      expect(result.verified).toBe(false)
      expect(result.finalStatus).toBe("BLOCKED")
      expect(result.unfulfilledRequiredSteps).toContain(step.id)

      const stepVer = result.stepVerifications.get(step.id)
      expect(stepVer?.verified).toBe(false)
      expect(stepVer?.missingCriteria.length).toBe(1)
    })

    it("resolves to FAILED when a required step definitively failed in execution", async () => {
      const step = makeStep("step_fatal", true, [{ type: "CAPABILITY_SUCCEEDED" }])
      const plan = makePlan([step])

      const execResult: ExecutionResult = {
        status: "FAILED",
        questId: plan.questId,
        planId: plan.id,
        completedSteps: [],
        failedSteps: [step.id],
        blockedSteps: [],
        skippedSteps: [],
        stepResults: new Map(),
        durationMs: 25,
      }

      const result = await verifier.verifyPlan(plan, execResult)

      expect(result.verified).toBe(false)
      expect(result.finalStatus).toBe("FAILED")
      expect(result.unfulfilledRequiredSteps).toContain(step.id)
    })
  })

  // ==========================================================================
  // 4. QUEST ENGINE SYNCHRONIZATION
  // ==========================================================================
  describe("Quest Engine SQLite Synchronization", () => {
    it("updates SQLite quest record from AWAITING_VERIFICATION to SUCCEEDED on completion", async () => {
      const planStep = makeStep("step_q1", true, [{ type: "CAPABILITY_SUCCEEDED" }])

      // 1. Create persistent quest with step in SQLite
      const quest = questEngine.createQuest({
        sessionId: "sess_c12_test",
        title: "Test Quest for C12",
        prompt: "Complete the pipeline",
        steps: [
          {
            stepId: asStepId("step_q1"),
            title: "Task Q1",
            capabilityId: planStep.capabilityId,
            inputPayload: planStep.arguments as unknown as JsonValue,
          },
        ],
      })

      const plan = makePlan([planStep])
      // Align questId with persistent record
      const alignedPlan: ValidatedExecutionPlan = {
        ...plan,
        questId: quest.questId,
      }

      // Transition quest step to RUNNING and complete
      questEngine.startStep(asStepId("step_q1"))
      questEngine.completeStep(asStepId("step_q1"), { ok: true })

      // Seed ledger
      const op = ledger.claimOperation({
        operationId: undefined,
        capabilityId: planStep.capabilityId,
        actionClass: "LOCAL_CREATE",
        idempotencyClass: "LEDGER_REQUIRED",
        input: planStep.arguments,
        questId: quest.questId,
        stepId: planStep.id,
      })
      if (op.status === "CLAIMED") {
        ledger.completeOperation({ operationId: op.operationId, resultPayload: { ok: true } })
      }

      const execResult: ExecutionResult = {
        status: "AWAITING_VERIFICATION",
        questId: quest.questId,
        planId: plan.id,
        completedSteps: [planStep.id],
        failedSteps: [],
        blockedSteps: [],
        skippedSteps: [],
        stepResults: new Map([[planStep.id, { ok: true }]]),
        durationMs: 35,
      }

      const result = await verifier.verifyPlan(alignedPlan, execResult, { autoSyncQuestEngine: true })

      expect(result.finalStatus).toBe("COMPLETED")

      // Check SQLite quest status
      const updatedQuest = questEngine.getQuest(quest.questId)
      expect(updatedQuest?.status).toBe("SUCCEEDED")
      expect(updatedQuest?.resultSummary).toContain("verified successfully")
    })
  })
})
