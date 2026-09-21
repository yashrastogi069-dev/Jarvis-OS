/**
 * JARVIS CORE V2 — SINGLE STEP EXECUTOR
 * 
 * Checkpoint C11 (Harden Repair Gate A, B, C):
 * - Step output reference resolution ($ref) via RFC 6901
 * - Canonical input schema normalization before policy, preview, hash, or execution (Repair Gate B)
 * - Central Action Policy with cryptographic ConfirmationToken validation (Repair Gate A)
 * - Operation Ledger claiming with canonical hashed arguments
 * - Safe boundary capability execution with UNKNOWN_COMMIT preservation (Repair Gate C)
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
import { normalizeCapabilityInput } from "../capabilities/normalizer"
import { resolveStepReferences } from "../planner/references"
import type { ValidatedPlanStep } from "../planner/validator"
import type { OperationLedger } from "../ledger"
import { deriveQuestStepOperationId } from "../ledger/canonical"
import { actionPolicyManager, ActionPolicyManager } from "../safety/policy"
import type { ConfirmationToken } from "../safety/types"
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
  private readonly policyManager: ActionPolicyManager

  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly ledger: OperationLedger,
    policyManager?: ActionPolicyManager
  ) {
    this.policyManager = policyManager ?? actionPolicyManager
  }

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

    // 3. Canonical Schema Normalization (Repair Gate B)
    // Ensures preview arguments === ledger-hashed arguments === handler arguments
    const normResult = normalizeCapabilityInput(capDef, resolvedArgs)
    if (!normResult.success) {
      return {
        status: "BLOCKED_WITH_REASON",
        stepId: step.id,
        reason: normResult.error.message,
        error: {
          code: normResult.error.code,
          message: normResult.error.message,
          retryable: false,
          details: normResult.error.details,
        },
        resolvedArguments: resolvedArgs,
      }
    }
    const canonicalArgs = normResult.canonicalArgs

    // 4. Central Action Policy & Confirmation Boundary (Repair Gate A)
    // A step ID or confirmedSteps array is NOT authorization.
    // Execution requires trusted C4 authorization token bound to exact canonical arguments.
    const suppliedToken = this.getSuppliedConfirmationToken(step.id, options)
    const policyDecision = this.policyManager.evaluatePolicy(
      capDef,
      canonicalArgs,
      suppliedToken ? { confirmationToken: suppliedToken } : undefined
    )

    let isConfirmedAuthorized = false

    if (policyDecision.type === "REQUIRE_CONFIRMATION") {
      const confirmationRequest: ConfirmationRequest = {
        stepId: step.id,
        capabilityId: step.capabilityId,
        actionClass: step.trustedMetadata.actionClass,
        arguments: canonicalArgs,
        preview: {
          summary: policyDecision.preview.summary,
          actionClass: step.trustedMetadata.actionClass,
          capabilityId: step.capabilityId,
          arguments: canonicalArgs,
          criticality: policyDecision.criticality ?? capDef.confirmation?.criticality ?? "MEDIUM",
          reason: policyDecision.reason,
          rawPreview: policyDecision.preview,
        },
        requestedAt: Date.now(),
        confirmationToken: policyDecision.token,
        expiresAt: policyDecision.expiresAt,
      }

      return {
        status: "PAUSED_FOR_CONFIRMATION",
        stepId: step.id,
        confirmationRequest,
        resolvedArguments: canonicalArgs,
      }
    }

    if (policyDecision.type === "BLOCK") {
      const reason = policyDecision.reason || "Action blocked by safety policy."
      return {
        status: "BLOCKED_WITH_REASON",
        stepId: step.id,
        reason,
        error: {
          code: "POLICY_BLOCKED",
          message: reason,
          retryable: false,
          details: { fixAction: policyDecision.fixAction },
        },
        resolvedArguments: canonicalArgs,
      }
    }

    if (policyDecision.type === "REQUIRE_CLARIFICATION") {
      return {
        status: "BLOCKED_WITH_REASON",
        stepId: step.id,
        reason: policyDecision.prompt,
        error: {
          code: "REQUIRE_CLARIFICATION",
          message: policyDecision.prompt,
          retryable: false,
          details: { missingFields: policyDecision.missingFields },
        },
        resolvedArguments: canonicalArgs,
      }
    }

    if (policyDecision.type === "ALLOW") {
      isConfirmedAuthorized = Boolean(suppliedToken)
    }

    // 5. Derive OperationId & Claim in Persistent Operation Ledger
    const operationId = deriveQuestStepOperationId(questId, step.id, step.capabilityId)

    const claimResult = this.ledger.claimOperation({
      operationId,
      capabilityId: step.capabilityId,
      actionClass: step.trustedMetadata.actionClass,
      idempotencyClass: step.trustedMetadata.idempotencyClass,
      input: canonicalArgs,
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
        resolvedArguments: canonicalArgs,
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
        resolvedArguments: canonicalArgs,
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
        resolvedArguments: canonicalArgs,
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
        resolvedArguments: canonicalArgs,
      }
    }

    // 6. Capability Execution via Safe Isolation Boundary
    // If confirmation was granted via trusted C4 token, pass confirmed: true for legacy schemas
    const executionInput = isConfirmedAuthorized
      ? { ...canonicalArgs, confirmed: true }
      : canonicalArgs

    const execResult = await executeCapabilitySafely(capDef, executionInput, {
      attempt: 1,
      signal: options.abortSignal,
    })

    // 7. Commit / Fail in Operation Ledger (Repair Gate C)
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
        resolvedArguments: canonicalArgs,
        wasCached: false,
      }
    } else {
      const isUnknownCommit =
        execResult.error.code === "UNKNOWN_COMMIT" ||
        execResult.error.retryHint === "REQUIRES_POLICY"

      const isRetryable = !isUnknownCommit && execResult.error.retryHint === "SAFE_TO_RETRY"

      this.ledger.failOperation({
        operationId,
        errorCode: execResult.error.code,
        errorMessage: execResult.error.message,
        isRetryable,
        isUnknownCommit,
      })

      return {
        status: isUnknownCommit ? "UNKNOWN_COMMIT" : (isRetryable ? "FAILED_RETRYABLE" : "FAILED_FINAL"),
        stepId: step.id,
        operationId,
        error: {
          code: execResult.error.code,
          message: execResult.error.message,
          retryable: isRetryable,
          details: execResult.error.details,
        },
        resolvedArguments: canonicalArgs,
      }
    }
  }

  private getSuppliedConfirmationToken(stepId: PlanStepId, options: ExecutorOptions): string | undefined {
    if (options.confirmationTokens) {
      if (options.confirmationTokens instanceof Map) {
        const token = options.confirmationTokens.get(stepId)
        if (token) return token
      } else if (typeof options.confirmationTokens === "object") {
        const token = (options.confirmationTokens as Record<string, string>)[stepId]
        if (token) return token
      }
    }
    return undefined
  }
}
