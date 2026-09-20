/**
 * JARVIS CORE V2 — TERMINAL COMPLETION VERIFIER TYPES
 * 
 * Checkpoint C12: Typed verification state, criteria evaluations, evidence receipts,
 * and goal resolution contracts.
 */

import type {
  JsonValue,
  PlanId,
  PlanStepId,
  QuestId,
  QuestStatus,
  TraceId,
} from "../types"
import type { CompletionCriterion } from "../planner/types"
import type { ValidatedExecutionPlan, ValidatedPlanStep } from "../planner/validator"
import type { ExecutionResult } from "../executor/types"

// ============================================================================
// 1. CRITERIA EVALUATION TYPES
// ============================================================================

export interface CriterionEvaluationResult {
  readonly criterion: CompletionCriterion
  readonly satisfied: boolean
  readonly evidence?: unknown
  readonly reason?: string
}

export interface StepVerificationResult {
  readonly stepId: PlanStepId
  readonly capabilityId: string
  readonly required: boolean
  readonly verified: boolean
  readonly criteriaEvaluations: ReadonlyArray<CriterionEvaluationResult>
  readonly missingCriteria: ReadonlyArray<CompletionCriterion>
  readonly output: JsonValue | null
}

// ============================================================================
// 2. PLAN VERIFICATION RESULT
// ============================================================================

export type TerminalQuestStatus =
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "BLOCKED"
  | "FAILED"

export interface PlanVerificationResult {
  readonly verified: boolean
  readonly finalStatus: TerminalQuestStatus
  readonly questId: QuestId
  readonly planId: PlanId
  readonly stepVerifications: ReadonlyMap<PlanStepId, StepVerificationResult>
  readonly unfulfilledRequiredSteps: ReadonlyArray<PlanStepId>
  readonly unfulfilledOptionalSteps: ReadonlyArray<PlanStepId>
  readonly summary: string
  readonly verifiedAt: number
}

// ============================================================================
// 3. VERIFIER OPTIONS
// ============================================================================

export interface VerifierOptions {
  readonly traceId?: TraceId
  readonly autoSyncQuestEngine?: boolean
}
