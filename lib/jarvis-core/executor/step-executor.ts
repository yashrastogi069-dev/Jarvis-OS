/**
 * JARVIS CORE V2 — SINGLE STEP EXECUTOR
 * 
 * Checkpoint C11: Argument resolution, confirmation boundary, ledger claiming,
 * safe boundary execution, and ledger commit/failure tracking.
 */

import type {
  CapabilityId,
  JsonValue,
  OperationId,
  PlanStepId,
  QuestId,
  StepStatus,
} from "../types"
import type { CapabilityRegistry } from "../capabilities/registry"
import type { CapabilityDefinition } from "../capabilities/types"
import { executeCapabilitySafely } from "../capabilities/safe-boundary"
import { resolveStepReferences } from "../planner/references"
import type { ValidatedPlanStep } from "../planner/validator"
import type { OperationLedger } from "../ledger"
import { deriveQuestStepOperationId } from "../ledger/canonical"
import type {
  ConfirmationPreview,
  ConfirmationRequest,
  ExecutorOptions,
  StepExecutionError,
} from "./types"

export type StepExecutionOutcome =
  | {
      readonly status: "COMPLETED"
      readonly stepId: PlanStepId
      readonly operationId: OperationId
      readonly resultPayload: JsonValue | null
      readonly resolvedArguments: Record<string, unknown>
      readonly wasCached: boolean
    }
  | {
      readonly status: "PAUSED_FOR_CONFIRMATION"
      readonly stepId: PlanStepId
      readonly confirmationRequest: ConfirmationRequest
      readonly resolvedArguments: Record<string, unknown>
    }
  | {
      readonly status: "BLOCKED_WITH_REASON"
      readonly stepId: PlanStepId
      readonly reason: string
      readonly error: StepExecutionError
      readonly resolvedArguments?: Record<string, unknown>
    }
  | {
      readonly status: "FAILED_RETRYABLE" | "FAILED_FINAL" | "UNKNOWN_COMMIT"
      readonly stepId: PlanStepId
      readonly operationId?: OperationId
      readonly error: StepExecutionError
      readonly resolvedArguments?: Record<string, unknown>
    }

export class SingleStepExecutor {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly ledger: OperationLedger
  ) {}

  /**
   * Deterministically execute a single validated plan step.
   */
  public async executeStep(
    questId: QuestId,
    step: ValidatedPlanStep,
    stepOutputs: Map<PlanStepId, JsonValue | null>,
    options: ExecutorOptions = {}
  ): Promise<StepExecutionOutcome> {
    // 1. Resolve $ref arguments using RFC 6901 JSON pointer evaluator
    const resolution = resolveStepReferences(step.arguments, stepOutputs as Map<any, unknown>)

    if (resolution.missingReferences.length > 0 || resolution.resolutionErrors.length > 0) {
      const missingDetails = resolution.missingReferences
        .map((r) => `${r.stepId}${r.path}`)
        .join(", ")
      const errorDetails = resolution.resolutionErrors.join("; ")
      const reason = `Step argument resolution failed: ${[missingDetails, errorDetails].filter(Boolean).join(" | ")}`

      return {
        status: "BLOCKED_WITH_REASON",
        stepId: step.id,
        reason,
        error: {
          code: "REFERENCE_RESOLUTION_ERROR",
          message: reason,
          retryable: false,
          details: {
            missingReferences: resolution.missingReferences,
            resolutionErrors: resolution.resolutionErrors,
          },
        },
      }
    }

    const resolvedArgs = resolution.resolved

    // 2. Fetch canonical capability definition
    const capDef = typeof this.registry.getById === "function"
      ? this.registry.getById(step.capabilityId)
      : (this.registry as any).get?.(step.capabilityId)

    if (!capDef) {
      return {
        status: "FAILED_FINAL",
        stepId: step.id,
        error: {
          code: "UNKNOWN_CAPABILITY",
          message: `Capability "${step.capabilityId}" is not registered in runtime registry.`,
          retryable: false,
        },
        resolvedArguments: resolvedArgs,
      }
    }

    // 3. Confirmation Policy Check (Zero Model Authority)
    const isConfirmed = this.checkIfStepConfirmed(step.id, options)
    if (step.trustedMetadata.requiresConfirmation && !isConfirmed) {
      const preview: ConfirmationPreview = {
        summary: `Execute ${capDef.title} (${step.capabilityId}) with action class ${step.trustedMetadata.actionClass}.`,
        actionClass: step.trustedMetadata.actionClass,
        capabilityId: step.capabilityId,
        arguments: resolvedArgs,
        criticality: capDef.confirmation.criticality,
        reason: capDef.confirmation.reason,
        rawPreview: resolvedArgs,
      }

      const confirmationRequest: ConfirmationRequest = {
        stepId: step.id,
        capabilityId: step.capabilityId,
        actionClass: step.trustedMetadata.actionClass,
        arguments: resolvedArgs,
        preview,
        requestedAt: Date.now(),
      }

      return {
        status: "PAUSED_FOR_CONFIRMATION",
        stepId: step.id,
        confirmationRequest,
        resolvedArguments: resolvedArgs,
      }
    }

    // 4. Derive OperationId & Claim in Persistent Operation Ledger
    const operationId = deriveQuestStepOperationId(questId, step.id, step.capabilityId)

    const claimResult = this.ledger.claimOperation({
      operationId,
      capabilityId: step.capabilityId,
      actionClass: step.trustedMetadata.actionClass,
      idempotencyClass: step.trustedMetadata.idempotencyClass,
      input: resolvedArgs,
      actor: options.actor ?? "user",
      questId,
      stepId: step.id,
    })

    // Handle Idempotent Cache Replay
    if (claimResult.status === "CACHED") {
      return {
        status: "COMPLETED",
        stepId: step.id,
        operationId,
        resultPayload: claimResult.resultPayload,
        resolvedArguments: resolvedArgs,
        wasCached: true,
      }
    }

    // Handle Ledger Conflicts
    if (claimResult.status === "CONFLICT") {
      return {
        status: "FAILED_FINAL",
        stepId: step.id,
        operationId,
        error: {
          code: "LEDGER_CONFLICT",
          message: claimResult.reason,
          retryable: false,
        },
        resolvedArguments: resolvedArgs,
      }
    }

    // Handle Ledger UNKNOWN_COMMIT Block
    if (claimResult.status === "UNKNOWN_COMMIT") {
      return {
        status: "UNKNOWN_COMMIT",
        stepId: step.id,
        operationId,
        error: {
          code: "LEDGER_UNKNOWN_COMMIT",
          message: claimResult.reason,
          retryable: false,
        },
        resolvedArguments: resolvedArgs,
      }
    }

    if (claimResult.status === "FAILED_FINAL") {
      return {
        status: "FAILED_FINAL",
        stepId: step.id,
        operationId,
        error: {
          code: "LEDGER_PREVIOUS_FAILURE",
          message: claimResult.reason,
          retryable: false,
        },
        resolvedArguments: resolvedArgs,
      }
    }

    // 5. Capability Execution via Safe Isolation Boundary
    // If confirmation was granted by user, inject confirmed: true for legacy connector schemas
    const executionInput = isConfirmed
      ? { ...resolvedArgs, confirmed: true }
      : resolvedArgs

    const execResult = await executeCapabilitySafely(capDef, executionInput, {
      attempt: 1,
      signal: options.abortSignal,
    })

    // 6. Commit / Fail in Operation Ledger
    if (execResult.success) {
      this.ledger.completeOperation({
        operationId,
        resultPayload: execResult.data,
      })

      return {
        status: "COMPLETED",
        stepId: step.id,
        operationId,
        resultPayload: execResult.data,
        resolvedArguments: resolvedArgs,
        wasCached: false,
      }
    } else {
      const isRetryable = execResult.error.retryHint === "SAFE_TO_RETRY"
      this.ledger.failOperation({
        operationId,
        errorCode: execResult.error.code,
        errorMessage: execResult.error.message,
        isRetryable,
      })

      return {
        status: isRetryable ? "FAILED_RETRYABLE" : "FAILED_FINAL",
        stepId: step.id,
        operationId,
        error: {
          code: execResult.error.code,
          message: execResult.error.message,
          retryable: isRetryable,
          details: execResult.error.details,
        },
        resolvedArguments: resolvedArgs,
      }
    }
  }

  private checkIfStepConfirmed(stepId: PlanStepId, options: ExecutorOptions): boolean {
    if (!options.confirmedSteps) return false
    if (options.confirmedSteps instanceof Set) {
      return options.confirmedSteps.has(stepId)
    }
    if (Array.isArray(options.confirmedSteps)) {
      return options.confirmedSteps.includes(stepId)
    }
    return false
  }
}
