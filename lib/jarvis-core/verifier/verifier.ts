/**
 * JARVIS CORE V2 — TERMINAL COMPLETION VERIFIER
 * 
 * Checkpoint C12: Sole authority that evaluates criteria, prevents premature completion,
 * derives final goal resolution (COMPLETED vs BLOCKED vs PARTIALLY_COMPLETED),
 * and syncs with QuestEngine.
 */

import type { PlanStepId, QuestId } from "../types"
import type { ValidatedExecutionPlan, ValidatedPlanStep } from "../planner/validator"
import type { ExecutionResult } from "../executor/types"
import type { OperationLedger } from "../ledger"
import { deriveQuestStepOperationId } from "../ledger/canonical"
import type { QuestEngine } from "../quest/engine"
import type { CompletionCriterion } from "../planner/types"
import { CriteriaEvaluator } from "./criteria-evaluator"
import type {
  CriterionEvaluationResult,
  PlanVerificationResult,
  StepVerificationResult,
  TerminalQuestStatus,
  VerifierOptions,
} from "./types"

export class TerminalCompletionVerifier {
  private readonly evaluator: CriteriaEvaluator

  constructor(
    private readonly ledger: OperationLedger,
    private readonly questEngine?: QuestEngine
  ) {
    this.evaluator = new CriteriaEvaluator()
  }

  /**
   * Deterministically verify a completed execution plan against all completion criteria
   * and derive the final terminal status.
   */
  public async verifyPlan(
    plan: ValidatedExecutionPlan,
    executionResult: ExecutionResult,
    options: VerifierOptions = {}
  ): Promise<PlanVerificationResult> {
    const verifiedAt = Date.now()
    const stepVerifications = new Map<PlanStepId, StepVerificationResult>()
    const unfulfilledRequiredSteps: PlanStepId[] = []
    const unfulfilledOptionalSteps: PlanStepId[] = []

    // 1. Evaluate Every Plan Step Against its Completion Criteria
    for (const step of plan.steps) {
      const stepOutput = executionResult.stepResults.get(step.id) ?? null
      const opId = deriveQuestStepOperationId(plan.questId, step.id, step.capabilityId)
      const ledgerRecord =
        this.ledger.getOperation(opId) ??
        this.ledger.getOperationByQuestStep(plan.questId, step.id)

      const criteriaEvaluations: CriterionEvaluationResult[] = []
      const missingCriteria: CompletionCriterion[] = []

      // If no criteria specified, default to CAPABILITY_SUCCEEDED
      const criteriaList =
        step.completionCriteria && step.completionCriteria.length > 0
          ? step.completionCriteria
          : [{ type: "CAPABILITY_SUCCEEDED" as const }]

      for (const criterion of criteriaList) {
        const evalRes = this.evaluator.evaluateCriterion(
          criterion,
          step,
          stepOutput,
          ledgerRecord
        )
        criteriaEvaluations.push(evalRes)
        if (!evalRes.satisfied) {
          missingCriteria.push(criterion)
        }
      }

      const isCompletedInResult = executionResult.completedSteps.includes(step.id)
      const allCriteriaSatisfied = missingCriteria.length === 0
      const isStepVerified = isCompletedInResult && allCriteriaSatisfied

      const stepVerification: StepVerificationResult = {
        stepId: step.id,
        capabilityId: step.capabilityId,
        required: step.required !== false,
        verified: isStepVerified,
        criteriaEvaluations,
        missingCriteria,
        output: stepOutput,
      }

      stepVerifications.set(step.id, stepVerification)

      if (!isStepVerified) {
        if (step.required !== false) {
          unfulfilledRequiredSteps.push(step.id)
        } else {
          unfulfilledOptionalSteps.push(step.id)
        }
      }
    }

    // 2. Derive Authoritative Goal Resolution (Anti-Premature Completion)
    const allRequiredVerified = unfulfilledRequiredSteps.length === 0
    let finalStatus: TerminalQuestStatus

    if (allRequiredVerified) {
      if (unfulfilledOptionalSteps.length === 0) {
        finalStatus = "COMPLETED"
      } else {
        finalStatus = "PARTIALLY_COMPLETED"
      }
    } else {
      // Determine if blocked or failed
      const hasDefinitiveFailure = executionResult.failedSteps.some((id) =>
        unfulfilledRequiredSteps.includes(id)
      )

      if (hasDefinitiveFailure) {
        finalStatus = "FAILED"
      } else {
        finalStatus = "BLOCKED"
      }
    }

    // 3. Synthesize Deterministic Summary
    const summary = this.buildVerificationSummary(
      finalStatus,
      plan,
      stepVerifications,
      unfulfilledRequiredSteps,
      unfulfilledOptionalSteps
    )

    // 4. Sync with Quest Engine (if attached and auto-sync enabled)
    if (this.questEngine && (options.autoSyncQuestEngine ?? true)) {
      try {
        const questTerminal =
          finalStatus === "COMPLETED"
            ? "SUCCEEDED"
            : finalStatus === "PARTIALLY_COMPLETED"
              ? "PARTIALLY_COMPLETED"
              : "FAILED"

        this.questEngine.verifyAndCompleteQuest(
          plan.questId,
          questTerminal,
          summary
        )
      } catch {
        // Safe fallback if quest record was already transitioned or not present in SQLite
      }
    }

    return {
      verified: allRequiredVerified,
      finalStatus,
      questId: plan.questId,
      planId: plan.id,
      stepVerifications,
      unfulfilledRequiredSteps,
      unfulfilledOptionalSteps,
      summary,
      verifiedAt,
    }
  }

  private buildVerificationSummary(
    finalStatus: TerminalQuestStatus,
    plan: ValidatedExecutionPlan,
    stepVerifications: Map<PlanStepId, StepVerificationResult>,
    unfulfilledRequired: ReadonlyArray<PlanStepId>,
    unfulfilledOptional: ReadonlyArray<PlanStepId>
  ): string {
    const totalSteps = plan.steps.length
    let verifiedCount = 0
    for (const v of stepVerifications.values()) {
      if (v.verified) verifiedCount += 1
    }

    if (finalStatus === "COMPLETED") {
      return `Quest "${plan.objective}" verified successfully: all ${totalSteps} steps completed with verified criteria.`
    }

    if (finalStatus === "PARTIALLY_COMPLETED") {
      return `Quest "${plan.objective}" partially completed: ${verifiedCount} of ${totalSteps} steps verified. Optional steps failed or skipped: ${unfulfilledOptional.join(", ")}.`
    }

    if (finalStatus === "FAILED") {
      return `Quest "${plan.objective}" failed: required steps failed permanently: ${unfulfilledRequired.join(", ")}.`
    }

    return `Quest "${plan.objective}" blocked: ${unfulfilledRequired.length} required step(s) pending or blocked: ${unfulfilledRequired.join(", ")}.`
  }
}
