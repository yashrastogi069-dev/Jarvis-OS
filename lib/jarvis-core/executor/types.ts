/**
 * JARVIS CORE V2 — DETERMINISTIC DAG EXECUTOR TYPES
 * 
 * Checkpoint C11: Typed execution state, step lifecycle status, confirmation requests,
 * and deterministic DAG scheduler contracts.
 */

import type {
  ActionClass,
  CapabilityId,
  JsonValue,
  OperationId,
  PlanId,
  PlanStepId,
  QuestId,
  StepStatus,
  TraceId,
} from "../types"
import type { ValidatedExecutionPlan, ValidatedPlanStep } from "../planner/validator"
import type { ConfirmationToken } from "../safety/types"

export type { ValidatedExecutionPlan, ValidatedPlanStep }

// ============================================================================
// 1. EXECUTOR STATUS & LIFECYCLE
// ============================================================================

export type ExecutorStatus =
  | "IDLE"
  | "RUNNING"
  | "PAUSED_FOR_CONFIRMATION"
  | "AWAITING_VERIFICATION"
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED"
  | "CANCELLED"

export interface StepExecutionError {
  readonly code: string
  readonly message: string
  readonly retryable?: boolean
  readonly details?: unknown
}

export interface StepExecutionRecord {
  readonly stepId: PlanStepId
  readonly capabilityId: CapabilityId
  status: StepStatus
  operationId: OperationId | null
  resolvedArguments: Record<string, unknown> | null
  resultPayload: JsonValue | null
  error: StepExecutionError | null
  startedAt: number | null
  completedAt: number | null
  attempts: number
}

// ============================================================================
// 2. CONFIRMATION REQUEST
// ============================================================================

export interface ConfirmationPreview {
  readonly summary: string
  readonly actionClass: ActionClass
  readonly capabilityId: CapabilityId
  readonly arguments: Record<string, unknown>
  readonly criticality: string
  readonly reason: string
  readonly rawPreview?: unknown
}

export interface ConfirmationRequest {
  readonly stepId: PlanStepId
  readonly capabilityId: CapabilityId
  readonly actionClass: ActionClass
  readonly arguments: Record<string, unknown>
  readonly preview: ConfirmationPreview
  readonly requestedAt: number
  readonly confirmationToken?: ConfirmationToken
  readonly expiresAt?: number
}

// ============================================================================
// 3. EXECUTION OPTIONS & RESULTS
// ============================================================================

export interface ExecutorOptions {
  readonly maxConcurrentReads?: number
  readonly actor?: string
  readonly confirmedSteps?: ReadonlySet<PlanStepId> | ReadonlyArray<PlanStepId>
  readonly confirmationTokens?: ReadonlyMap<PlanStepId, ConfirmationToken | string> | Record<string, string>
  readonly abortSignal?: AbortSignal
  readonly questEngine?: any
  readonly policyManager?: any
  readonly onStepStart?: (step: ValidatedPlanStep, attempt: number) => void
  readonly onStepComplete?: (step: ValidatedPlanStep, result: JsonValue | null) => void
  readonly onStepFailed?: (step: ValidatedPlanStep, error: StepExecutionError) => void
  readonly onStepBlocked?: (step: ValidatedPlanStep, reason: string) => void
  readonly onPauseForConfirmation?: (request: ConfirmationRequest) => void
}

export interface ExecutionResult {
  readonly status: ExecutorStatus
  readonly questId: QuestId
  readonly planId: PlanId
  readonly completedSteps: ReadonlyArray<PlanStepId>
  readonly failedSteps: ReadonlyArray<PlanStepId>
  readonly blockedSteps: ReadonlyArray<PlanStepId>
  readonly skippedSteps: ReadonlyArray<PlanStepId>
  readonly confirmationRequest?: ConfirmationRequest
  readonly stepResults: ReadonlyMap<PlanStepId, JsonValue | null>
  readonly error?: string
  readonly durationMs: number
}

export interface ExecutionRecoverySummary {
  readonly recoveredStepsCount: number
  readonly completedFromLedger: ReadonlyArray<PlanStepId>
  readonly unknownCommitSteps: ReadonlyArray<PlanStepId>
  readonly pendingSteps: ReadonlyArray<PlanStepId>
}
