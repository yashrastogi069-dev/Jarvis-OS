/**
 * JARVIS CORE V2 — CONTROLLED REPLANNER TEST SUITE
 * 
 * Checkpoint C13: Bounded replan budget (<=2 attempts), patch semantics on unfinished subgraphs,
 * immutability of completed step history, dependency pruning, and deterministic validation gate.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  ControlledReplanner,
  DeterministicPlanValidator,
  MAX_REPLAN_ATTEMPTS,
  type ValidatedExecutionPlan,
  type ValidatedPlanStep,
  type PlannerStep,
} from "../../lib/jarvis-core/planner"
import { capabilityRegistry } from "../../lib/jarvis-core/capabilities/registry"
import {
  asCapabilityId,
  asPlanId,
  asPlanStepId,
  asQuestId,
  asTraceId,
} from "../../lib/jarvis-core/types"

describe("JARVIS CORE V2 — Controlled Replanner (C13)", () => {
  let validator: DeterministicPlanValidator
  let replanner: ControlledReplanner

  beforeEach(() => {
    validator = new DeterministicPlanValidator(capabilityRegistry)
    replanner = new ControlledReplanner(validator)
  })

  function makeStep(
    id: string,
    capabilityId: string,
    args: Record<string, unknown>,
    dependsOn: string[] = []
  ): ValidatedPlanStep {
    return {
      id: asPlanStepId(id),
      objective: `Subtask ${id}`,
      capabilityId: asCapabilityId(capabilityId),
      arguments: args as any,
      dependsOn: dependsOn.map((d) => asPlanStepId(d)),
      completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
      required: true,
      trustedMetadata: {
        actionClass: "READ_ONLY",
        confirmationPolicy: "NONE",
        idempotencyClass: "READ_ONLY",
        requiresConfirmation: false,
        domain: "research",
        previewSupported: true,
      },
    }
  }

  function makePlan(steps: ValidatedPlanStep[]): ValidatedExecutionPlan {
    return {
      id: asPlanId("plan_rep_001"),
      questId: asQuestId("quest_rep_001"),
      traceId: asTraceId("trace_rep_001"),
      objective: "Replanner test plan",
      version: 1,
      steps,
      createdAt: Date.now(),
      topologicalOrder: steps.map((s) => s.id),
    }
  }

  // ==========================================================================
  // 1. MATERIAL TRIGGER DETECTION & ELIGIBILITY
  // ==========================================================================
  describe("Material Trigger Detection & Eligibility", () => {
    it("detects MISSING_PREREQUISITE when entity is not found", () => {
      const step = makeStep("step_1", "research.search", { query: "query" })
      const plan = makePlan([step])

      const res = replanner.evaluateReplanEligibility(
        plan,
        step.id,
        "Entity not found in remote repository: 404",
        0
      )

      expect(res.eligible).toBe(true)
      expect(res.trigger).toBe("MISSING_PREREQUISITE")
      expect(res.remainingAttempts).toBe(2)
    })

    it("detects USER_REDIRECTION when user changes goal", () => {
      const step = makeStep("step_1", "research.search", { query: "query" })
      const plan = makePlan([step])

      const res = replanner.evaluateReplanEligibility(
        plan,
        step.id,
        "User redirected goal: search for meetings instead",
        1
      )

      expect(res.eligible).toBe(true)
      expect(res.trigger).toBe("USER_REDIRECTION")
      expect(res.remainingAttempts).toBe(1)
    })

    it("detects EXTERNAL_STATE_MISMATCH on conflict or state change", () => {
      const step = makeStep("step_1", "research.search", { query: "query" })
      const plan = makePlan([step])

      const res = replanner.evaluateReplanEligibility(
        plan,
        step.id,
        "Version conflict: entity changed externally by concurrent actor",
        0
      )

      expect(res.eligible).toBe(true)
      expect(res.trigger).toBe("EXTERNAL_STATE_MISMATCH")
    })
  })

  // ==========================================================================
  // 2. STRICT BUDGET INVARIANT (<= 2 ATTEMPTS)
  // ==========================================================================
  describe("Strict Replan Budget Invariant", () => {
    it("permits attempt 0 and attempt 1, but rejects attempt 2", () => {
      const step = makeStep("step_1", "research.search", { query: "query" })
      const plan = makePlan([step])

      const attempt0 = replanner.evaluateReplanEligibility(plan, step.id, "error", 0)
      expect(attempt0.eligible).toBe(true)
      expect(attempt0.remainingAttempts).toBe(2)

      const attempt1 = replanner.evaluateReplanEligibility(plan, step.id, "error", 1)
      expect(attempt1.eligible).toBe(true)
      expect(attempt1.remainingAttempts).toBe(1)

      const attempt2 = replanner.evaluateReplanEligibility(plan, step.id, "error", 2)
      expect(attempt2.eligible).toBe(false)
      expect(attempt2.remainingAttempts).toBe(0)
      expect(attempt2.reason).toContain("budget exhausted")
    })

    it("fails replanning immediately if attemptCount >= MAX_REPLAN_ATTEMPTS", async () => {
      const step = makeStep("step_1", "research.search", { query: "query" })
      const plan = makePlan([step])

      const res = await replanner.replan(plan, {
        failedStepId: step.id,
        trigger: "RECOVERABLE_STEP_FAILURE",
        reason: "Budget test",
        attemptCount: MAX_REPLAN_ATTEMPTS,
        completedStepIds: [],
        replacementSteps: [],
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain("budget exceeded")
    })
  })

  // ==========================================================================
  // 3. PATCH SEMANTICS & IMMUTABILITY OF COMPLETED HISTORY
  // ==========================================================================
  describe("Patch Semantics & Dependency Pruning", () => {
    it("preserves completed steps, prunes failed step + its dependents, and adds replacement", async () => {
      // Step A (Completed) -> Step B (Failed) -> Step C (Dependent on B)
      // Step D (Independent)
      const stepA = makeStep("step_a", "research.search", { query: "search A" })
      const stepB = makeStep("step_b", "tasks.list", { status: "open" }, ["step_a"])
      const stepC = makeStep("step_c", "tasks.list", { status: "closed" }, ["step_b"])
      const stepD = makeStep("step_d", "research.search", { query: "independent D" })

      const plan = makePlan([stepA, stepB, stepC, stepD])

      const replacementStep: PlannerStep = {
        id: asPlanStepId("step_b_alt"),
        objective: "Alternative search",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "fallback query" },
        dependsOn: [stepA.id], // Depends cleanly on completed step A
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
      }

      const replanResult = await replanner.replan(plan, {
        failedStepId: stepB.id,
        trigger: "MISSING_PREREQUISITE",
        reason: "No tasks found in step B",
        attemptCount: 0,
        completedStepIds: [stepA.id], // Step A is completed
        replacementSteps: [replacementStep],
      })

      expect(replanResult.success).toBe(true)
      expect(replanResult.attemptCount).toBe(1)
      expect(replanResult.preservedStepIds).toEqual([stepA.id])
      expect(replanResult.prunedStepIds).toEqual([stepB.id, stepC.id]) // Both B and downstream C pruned!
      expect(replanResult.addedStepIds).toEqual([replacementStep.id])

      const newPlan = replanResult.newPlan!
      expect(newPlan.version).toBe(2)
      expect(newPlan.steps.map((s: ValidatedPlanStep) => s.id)).toEqual([
        stepA.id, // Preserved
        stepD.id, // Retained independent
        replacementStep.id, // Added patch
      ])
    })

    it("rejects replanning if replacement step depends on a pruned step", async () => {
      const step1 = makeStep("step_1", "research.search", { query: "search 1" })
      const step2 = makeStep("step_2", "tasks.list", { status: "open" }, ["step_1"])
      const plan = makePlan([step1, step2])

      const invalidReplacement: PlannerStep = {
        id: asPlanStepId("step_bad"),
        objective: "Bad replacement",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "bad" },
        dependsOn: [step2.id], // Depends on step2 which is being pruned!
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
      }

      const res = await replanner.replan(plan, {
        failedStepId: step2.id,
        trigger: "RECOVERABLE_STEP_FAILURE",
        reason: "Failed",
        attemptCount: 0,
        completedStepIds: [step1.id],
        replacementSteps: [invalidReplacement],
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain("depends on pruned step")
    })
  })

  // ==========================================================================
  // 4. VALIDATION GATE ON REPLANNED DAG
  // ==========================================================================
  describe("Deterministic Validation Gate on Composite DAG", () => {
    it("rejects replanned plan if replacement steps introduce a cycle", async () => {
      const step1 = makeStep("step_1", "research.search", { query: "search 1" })
      const step2 = makeStep("step_2", "tasks.list", { status: "open" }, ["step_1"])
      const plan = makePlan([step1, step2])

      // Mutual cycle between replacement step X and Y
      const repX: PlannerStep = {
        id: asPlanStepId("step_x"),
        objective: "X",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "x" },
        dependsOn: [asPlanStepId("step_y")],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
      }

      const repY: PlannerStep = {
        id: asPlanStepId("step_y"),
        objective: "Y",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "y" },
        dependsOn: [asPlanStepId("step_x")],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
      }

      const res = await replanner.replan(plan, {
        failedStepId: step2.id,
        trigger: "RECOVERABLE_STEP_FAILURE",
        reason: "Failed",
        attemptCount: 0,
        completedStepIds: [step1.id],
        replacementSteps: [repX, repY],
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain("CYCLIC_DEPENDENCY")
    })

    it("accepts valid replanned DAG and derives trusted metadata", async () => {
      const step1 = makeStep("step_1", "research.search", { query: "search 1" })
      const step2 = makeStep("step_2", "tasks.list", { status: "open" }, ["step_1"])
      const plan = makePlan([step1, step2])

      const repValid: PlannerStep = {
        id: asPlanStepId("step_valid"),
        objective: "Clean replacement",
        capabilityId: asCapabilityId("tasks.create"),
        arguments: { title: "New created task" },
        dependsOn: [step1.id],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
      }

      const res = await replanner.replan(plan, {
        failedStepId: step2.id,
        trigger: "RECOVERABLE_STEP_FAILURE",
        reason: "Failed",
        attemptCount: 0,
        completedStepIds: [step1.id],
        replacementSteps: [repValid],
      })

      expect(res.success).toBe(true)
      expect(res.newPlan).toBeDefined()
      expect(res.newPlan?.steps[1].trustedMetadata.actionClass).toBe("LOCAL_CREATE")
    })
  })
})
