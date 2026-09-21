/**
 * JARVIS CORE V2 — DIRECT ACTION EXECUTION CONTROLLER
 * 
 * Checkpoint: Pre-Phase-4 Repair Gate E
 * Canonical controller for simple, single-capability ACTION execution:
 * C6 classification -> C7 capability -> Action Argument Resolution ->
 * Schema Normalization -> C4 Policy & Confirmation -> C5 Operation Ledger ->
 * C3 Safe Boundary -> Result Envelopes.
 */

import type { CapabilityId, TurnId } from "../types"
import type { CapabilityRegistry } from "../capabilities/registry"
import { executeCapabilitySafely } from "../capabilities/safe-boundary"
import type { OperationLedger } from "../ledger"
import { deriveActionOperationId } from "../ledger/canonical"
import { actionPolicyManager, ActionPolicyManager } from "../safety/policy"
import { ActionArgumentResolver } from "./resolver"
import type {
  ActionArgumentModel,
  ActionExecutionOptions,
  ActionExecutionOutcome,
} from "./types"

export class DirectActionRuntime {
  private readonly resolver: ActionArgumentResolver
  private readonly policyManager: ActionPolicyManager

  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly ledger: OperationLedger,
    policyManager?: ActionPolicyManager
  ) {
    this.resolver = new ActionArgumentResolver()
    this.policyManager = policyManager ?? actionPolicyManager
  }

  /**
   * Execute a single direct capability ACTION.
   */
  public async executeAction(
    userRequest: string,
    capabilityId: CapabilityId,
    turnId: TurnId,
    actionSlot: number = 0,
    options: ActionExecutionOptions = {}
  ): Promise<ActionExecutionOutcome> {
    // 1. Fetch Capability Definition
    const capDef = typeof this.registry.getById === "function"
      ? this.registry.getById(capabilityId)
      : (this.registry as any).get?.(capabilityId)

    if (!capDef) {
      return {
        status: "FAILED",
        turnId,
        actionSlot,
        capabilityId,
        error: {
          code: "UNKNOWN_CAPABILITY",
          message: `Capability "${capabilityId}" is not registered in runtime registry.`,
          retryable: false,
        },
      }
    }

    // 2. Resolve & Normalize Arguments
    const resolution = await this.resolver.resolve(
      {
        userRequest,
        capabilityId,
        capability: capDef,
      },
      options.modelAdapter
    )

    if (resolution.status === "NEEDS_CLARIFICATION") {
      return {
        status: "NEEDS_CLARIFICATION",
        turnId,
        capabilityId,
        prompt: resolution.clarificationPrompt || `More information needed for ${capDef.title}.`,
        missingFields: resolution.missingFields,
      }
    }

    if (resolution.status === "INVALID" || !resolution.canonicalArguments) {
      return {
        status: "FAILED",
        turnId,
        actionSlot,
        capabilityId,
        error: {
          code: "INVALID_INPUT",
          message: resolution.error || "Failed to resolve valid arguments for action.",
          retryable: false,
        },
      }
    }

    const canonicalArgs = resolution.canonicalArguments

    // 3. Central Action Safety Policy Check
    const policyDecision = this.policyManager.evaluatePolicy(
      capDef,
      canonicalArgs,
      options.confirmationToken ? { confirmationToken: options.confirmationToken } : undefined
    )

    let isAuthorized = false

    if (policyDecision.type === "REQUIRE_CONFIRMATION") {
      return {
        status: "CONFIRMATION_REQUIRED",
        turnId,
        actionSlot,
        capabilityId,
        arguments: canonicalArgs,
        confirmationToken: policyDecision.token,
        preview: policyDecision.preview,
        reason: policyDecision.reason,
        criticality: policyDecision.criticality,
      }
    }

    if (policyDecision.type === "REQUIRE_CLARIFICATION") {
      return {
        status: "NEEDS_CLARIFICATION",
        turnId,
        capabilityId,
        prompt: policyDecision.prompt,
        missingFields: policyDecision.missingFields,
      }
    }

    if (policyDecision.type === "BLOCK") {
      return {
        status: "BLOCKED",
        turnId,
        capabilityId,
        reason: policyDecision.reason,
        fixAction: policyDecision.fixAction,
      }
    }

    if (policyDecision.type === "ALLOW") {
      isAuthorized = Boolean(options.confirmationToken)
    }

    // 4. Derive OperationId & Claim in Ledger
    const operationId = deriveActionOperationId(turnId, actionSlot, capabilityId)

    const claimResult = this.ledger.claimOperation({
      operationId,
      capabilityId,
      actionClass: capDef.actionClass,
      idempotencyClass: capDef.idempotency.idempotencyClass,
      input: canonicalArgs,
      actor: options.actor ?? "user",
    })

    // Handle Idempotent Cache
    if (claimResult.status === "CACHED") {
      return {
        status: "COMPLETED",
        turnId,
        actionSlot,
        operationId,
        capabilityId,
        arguments: canonicalArgs,
        result: claimResult.resultPayload,
        wasCached: true,
      }
    }

    if (claimResult.status === "CONFLICT") {
      return {
        status: "FAILED",
        turnId,
        actionSlot,
        operationId,
        capabilityId,
        error: {
          code: "LEDGER_CONFLICT",
          message: claimResult.reason,
          retryable: false,
        },
      }
    }

    if (claimResult.status === "UNKNOWN_COMMIT") {
      return {
        status: "UNKNOWN_COMMIT",
        turnId,
        actionSlot,
        operationId,
        capabilityId,
        error: {
          code: "LEDGER_UNKNOWN_COMMIT",
          message: claimResult.reason,
          retryable: false,
        },
      }
    }

    // 5. Capability Execution via Safe Boundary
    const executionInput = isAuthorized
      ? { ...canonicalArgs, confirmed: true }
      : canonicalArgs

    const execResult = await executeCapabilitySafely(capDef, executionInput, {
      attempt: 1,
      signal: options.signal,
      trace: options.traceId ? { traceId: options.traceId, turnId } : undefined,
    })

    // 6. Commit / Fail in Operation Ledger
    if (execResult.success) {
      this.ledger.completeOperation({
        operationId,
        resultPayload: execResult.data,
      })

      return {
        status: "COMPLETED",
        turnId,
        actionSlot,
        operationId,
        capabilityId,
        arguments: canonicalArgs,
        result: execResult.data,
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
        status: isUnknownCommit ? "UNKNOWN_COMMIT" : "FAILED",
        turnId,
        actionSlot,
        operationId,
        capabilityId,
        error: {
          code: execResult.error.code,
          message: execResult.error.message,
          retryable: isRetryable,
          details: execResult.error.details,
        },
      }
    }
  }
}
