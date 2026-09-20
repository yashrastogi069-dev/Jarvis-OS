/**
 * JARVIS CORE V2 — CONTROLLED REPLANNER
 * 
 * Checkpoint C13: Bounded replan budget (<=2 attempts), patch semantics on unfinished subgraphs,
 * immutability of completed step history, and deterministic validation gate.
 */

import type { PlanId, PlanStepId, QuestId } from "../types"
import { asPlanId, asPlanStepId } from "../types"
import type { DeterministicPlanValidator, ValidatedExecutionPlan, ValidatedPlanStep } from "./validator"
import type {
  ExecutionPlan,
  PlannerStep,
  ReplanEligibility,
  ReplanRequest,
  ReplanResult,
  ReplanTriggerType,
} from "./types"
import { MAX_REPLAN_ATTEMPTS, PLAN_LIMITS } from "./types"

export class ControlledReplanner {
  constructor(private readonly validator: DeterministicPlanValidator) {}

  /**
   * Evaluate whether a failed or blocked execution plan is eligible for replanning.
   * Enforces strict 2-attempt budget and material trigger detection.
   */
  public evaluateReplanEligibility(
    plan: ValidatedExecutionPlan,
    failedStepId: PlanStepId,
    failureReason: string,
    attemptCount: number
  ): ReplanEligibility {
    // 1. Strict Budget Invariant (MAX_REPLAN_ATTEMPTS = 2)
    if (attemptCount >= MAX_REPLAN_ATTEMPTS) {
      return {
        eligible: false,
        reason: `Replan budget exhausted: maximum ${MAX_REPLAN_ATTEMPTS} attempts allowed per quest.`,
        remainingAttempts: 0,
      }
    }

    // 2. Failed step must exist in plan
    const step = plan.steps.find((s) => s.id === failedStepId)
    if (!step) {
      return {
        eligible: false,
        reason: `Failed step "${failedStepId}" does not exist in execution plan.`,
        remainingAttempts: MAX_REPLAN_ATTEMPTS - attemptCount,
      }
    }

    // 3. Detect Material Trigger
    const lower = failureReason.toLowerCase()
    let trigger: ReplanTriggerType

    if (
      lower.includes("not found") ||
      lower.includes("missing") ||
      lower.includes("no results") ||
      lower.includes("ambiguous") ||
      lower.includes("prerequisite")
    ) {
      trigger = "MISSING_PREREQUISITE"
    } else if (
      lower.includes("redirect") ||
      lower.includes("user changed") ||
      lower.includes("switch goal")
    ) {
      trigger = "USER_REDIRECTION"
    } else if (
      lower.includes("conflict") ||
      lower.includes("mismatch") ||
      lower.includes("stale") ||
      lower.includes("changed externally")
    ) {
      trigger = "EXTERNAL_STATE_MISMATCH"
    } else {
      trigger = "RECOVERABLE_STEP_FAILURE"
    }

    return {
      eligible: true,
      trigger,
      reason: failureReason,
      remainingAttempts: MAX_REPLAN_ATTEMPTS - attemptCount,
    }
  }

  /**
   * Deterministically patch an execution plan's unfinished subgraph.
   * Preserves all completed step history and validates the composite DAG.
   */
  public async replan(
    plan: ValidatedExecutionPlan,
    request: ReplanRequest
  ): Promise<ReplanResult> {
    const { failedStepId, attemptCount, completedStepIds, replacementSteps } = request

    // 1. Enforce Replan Attempt Budget
    if (attemptCount >= MAX_REPLAN_ATTEMPTS) {
      return {
        success: false,
        attemptCount,
        preservedStepIds: [],
        prunedStepIds: [],
        addedStepIds: [],
        error: `Replan budget exceeded: attempt count ${attemptCount} exceeds limit of ${MAX_REPLAN_ATTEMPTS}.`,
      }
    }

    const completedSet = new Set<string>(completedStepIds)

    // 2. Identify Preserved Steps (Immutable Completed History)
    const preservedSteps: PlannerStep[] = []
    const preservedStepIds: PlanStepId[] = []

    for (const step of plan.steps) {
      if (completedSet.has(step.id)) {
        preservedSteps.push({
          id: step.id,
          objective: step.objective,
          capabilityId: step.capabilityId,
          arguments: step.arguments,
          dependsOn: step.dependsOn,
          completionCriteria: step.completionCriteria,
          required: step.required,
        })
        preservedStepIds.push(step.id)
      }
    }

    // 3. Find Downstream Dependent Steps of the Failed Step (To Prune)
    const stepsToPrune = new Set<string>([failedStepId])
    let changed = true
    while (changed) {
      changed = false
      for (const step of plan.steps) {
        if (completedSet.has(step.id) || stepsToPrune.has(step.id)) {
          continue
        }
        for (const depId of step.dependsOn) {
          if (stepsToPrune.has(depId)) {
            stepsToPrune.add(step.id)
            changed = true
            break
          }
        }
      }
    }

    const prunedStepIds: PlanStepId[] = Array.from(stepsToPrune).map((id) =>
      asPlanStepId(id)
    )

    // 4. Retain Independent Uncompleted Steps
    const retainedIndependentSteps: PlannerStep[] = []
    for (const step of plan.steps) {
      if (!completedSet.has(step.id) && !stepsToPrune.has(step.id)) {
        retainedIndependentSteps.push({
          id: step.id,
          objective: step.objective,
          capabilityId: step.capabilityId,
          arguments: step.arguments,
          dependsOn: step.dependsOn,
          completionCriteria: step.completionCriteria,
          required: step.required,
        })
      }
    }

    // 5. Add Replacement Steps (Patch)
    const addedStepIds: PlanStepId[] = replacementSteps.map((s) => s.id)

    // Verify replacement steps do not depend on pruned steps
    for (const repStep of replacementSteps) {
      for (const depId of repStep.dependsOn) {
        if (stepsToPrune.has(depId)) {
          return {
            success: false,
            attemptCount,
            preservedStepIds,
            prunedStepIds,
            addedStepIds,
            error: `Replacement step "${repStep.id}" depends on pruned step "${depId}".`,
          }
        }
      }
    }

    const compositeSteps: PlannerStep[] = [
      ...preservedSteps,
      ...retainedIndependentSteps,
      ...replacementSteps,
    ]

    // Check size limit
    if (compositeSteps.length > PLAN_LIMITS.MAX_STEPS) {
      return {
        success: false,
        attemptCount,
        preservedStepIds,
        prunedStepIds,
        addedStepIds,
        error: `Replanned composite steps (${compositeSteps.length}) exceed maximum limit of ${PLAN_LIMITS.MAX_STEPS}.`,
      }
    }

    // 6. Build Candidate Plan with Incremented Version
    const newVersion = plan.version + 1
    const candidatePlan: ExecutionPlan = {
      id: asPlanId(`${plan.id}_v${newVersion}`),
      questId: plan.questId,
      traceId: plan.traceId,
      objective: plan.objective,
      version: newVersion,
      steps: compositeSteps,
      createdAt: Date.now(),
    }

    // 7. Validate Candidate Plan via DeterministicPlanValidator Gate (C10)
    const validationRes = this.validator.validate(candidatePlan)
    if (!validationRes.valid) {
      const issueMsgs = validationRes.issues.map((i) => `[${i.code}] ${i.message}`).join("; ")
      return {
        success: false,
        attemptCount,
        preservedStepIds,
        prunedStepIds,
        addedStepIds,
        error: `Replanned plan validation failed: ${issueMsgs}`,
      }
    }

    return {
      success: true,
      newPlan: validationRes.plan,
      preservedStepIds,
      prunedStepIds,
      addedStepIds,
      attemptCount: attemptCount + 1,
    }
  }
}
