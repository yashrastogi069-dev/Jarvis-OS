/**
 * JARVIS CORE V2 — CENTRAL ACTION SAFETY & CONFIRMATION POLICY ENGINE
 * 
 * Checkpoint: C4 (Sections C4.1 – C4.14)
 * Status: Authoritative Runtime Action Policy Engine
 * 
 * Architectural Invariants:
 * 1. Runtime Controls Authorization: The AI model or prompt can NEVER authorize itself;
 *    `confirmed: true` in arguments or text has zero authority.
 * 2. Pre-Execution Gate: Every capability passes through evaluatePolicy() before handler invocation.
 * 3. Cryptographic Token Binding: ConfirmationTokens are single-use, 5-minute expiring,
 *    and bound to exact canonical argument hashes.
 * 4. Post-Validation Arguments: Policy and previews bind strictly to validated Zod outputs.
 * 5. Deterministic Decision Union: Returns ALLOW, REQUIRE_CONFIRMATION, REQUIRE_CLARIFICATION, or BLOCK.
 */

import crypto from "node:crypto"
import type { CapabilityId, JsonValue } from "../types"
import type { CapabilityCriticality, CapabilityDefinition } from "../capabilities/types"
import { capabilityRegistry } from "../capabilities/registry"
import { executeCapabilitySafely } from "../capabilities/safe-boundary"
import type { CapabilityExecutionContext, CapabilityResult } from "../capabilities/result"
import {
  type ConfirmationToken,
  asConfirmationToken,
  type PolicyDecision,
  type ActionAuthorizationContext,
  type AuthorizedExecutionResult,
  type ConfirmationRequiredDecision,
  type ActionPreview,
} from "./types"
import { hashCanonicalArgs } from "./canonical"
import { generateActionPreview } from "./preview"

interface ActiveConfirmation {
  readonly token: ConfirmationToken
  readonly capabilityId: CapabilityId
  readonly argumentsHash: string
  readonly preview: ActionPreview
  readonly reason: string
  readonly criticality: CapabilityCriticality
  readonly expiresAt: number
  consumed: boolean
}

const DEFAULT_CONFIRMATION_TTL_MS = 5 * 60 * 1000 // 5 minutes

export class ActionPolicyManager {
  private readonly tokens = new Map<string, ActiveConfirmation>()

  /**
   * Determine the policy requirement for a capability invocation with validated arguments.
   */
  public evaluatePolicy(
    capability: CapabilityDefinition,
    validatedArgs: Record<string, any>,
    authContext?: ActionAuthorizationContext,
  ): PolicyDecision {
    const actionClass = capability.actionClass
    const capId = capability.id

    // 1. Clarification Pre-checks (Section C4.4)
    // If destructive target cannot be confidently identified, require clarification instead of confirmation
    if (capId === "tasks.delete") {
      const id = validatedArgs?.id
      if (id === undefined || id === null || (typeof id === "number" && id <= 0)) {
        return {
          type: "REQUIRE_CLARIFICATION",
          reason: "Target task ID is missing or invalid.",
          missingFields: ["id"],
          prompt: "Please specify the ID of the task you wish to delete.",
        }
      }
    }

    if (capId === "memory.delete") {
      const id = validatedArgs?.id
      if (id === undefined || id === null || (typeof id === "number" && id <= 0)) {
        return {
          type: "REQUIRE_CLARIFICATION",
          reason: "Target memory ID is missing or invalid.",
          missingFields: ["id"],
          prompt: "Please specify the ID of the memory you wish to delete.",
        }
      }
    }

    // 2. Default Policy Matrix (Section C4.3)
    let requiresConfirmation = false
    let reason = "Action requires confirmation."
    let criticality: CapabilityCriticality = "MEDIUM"

    if (actionClass === "READ_ONLY" || actionClass === "LOCAL_CREATE" || actionClass === "LOCAL_UPDATE") {
      requiresConfirmation = false
    } else if (actionClass === "LOCAL_DELETE") {
      requiresConfirmation = true
      criticality = "HIGH"
      reason = `Local deletion on ${capability.domain} is irreversible and requires confirmation.`
    } else if (actionClass === "EXTERNAL_CREATE") {
      requiresConfirmation = true
      criticality = "HIGH"
      reason = `Creating external resource in ${capability.domain} requires confirmation.`
    } else if (actionClass === "EXTERNAL_UPDATE") {
      requiresConfirmation = true
      criticality = "MEDIUM"
      reason = `Modifying external state in ${capability.domain} requires confirmation.`
    } else if (actionClass === "EXTERNAL_SEND") {
      requiresConfirmation = true
      criticality = "CRITICAL"
      reason = `External transmission via ${capability.domain} cannot be undone and requires confirmation.`
    } else if (actionClass === "EXTERNAL_DELETE") {
      requiresConfirmation = true
      criticality = "HIGH"
      reason = `Deleting external resource in ${capability.domain} requires confirmation.`
    } else if (actionClass === "SYSTEM_ACTION") {
      requiresConfirmation = true
      criticality = "HIGH"
      reason = `Executing system action (${capId}) requires confirmation.`
    }

    // Check capability-specific override if explicitly set in definition
    if (capability.confirmation.defaultPolicy === "REQUIRED") {
      requiresConfirmation = true
    } else if (capability.confirmation.defaultPolicy === "NONE" && actionClass === "READ_ONLY") {
      requiresConfirmation = false
    }

    if (capability.confirmation.criticality) {
      criticality = capability.confirmation.criticality
    }

    // 3. If action is safe without confirmation, ALLOW immediately
    if (!requiresConfirmation) {
      return { type: "ALLOW", reason: "Action is safe to execute autonomously." }
    }

    // 4. Action requires confirmation: Verify supplied authorization token (Section C4.5 & C4.8)
    const suppliedToken = authContext?.confirmationToken
    if (suppliedToken) {
      const validation = this.validateAndConsumeToken(suppliedToken, capId, validatedArgs)
      if (validation.valid) {
        return { type: "ALLOW", reason: "Valid confirmation token presented." }
      }
      // If a token was provided but is invalid or mismatched, block execution with explicit rationale
      return {
        type: "BLOCK",
        reason: validation.reason ?? "Invalid confirmation token.",
        fixAction: "Re-confirm the action to receive a fresh authorization token.",
      }
    }

    // 5. No token presented: Issue new ConfirmationToken and return preview
    return this.issueConfirmation(capability, validatedArgs, reason, criticality)
  }

  /**
   * Issue an unforgeable, cryptographically random ConfirmationToken bound to exact argument hash.
   */
  public issueConfirmation(
    capability: CapabilityDefinition,
    validatedArgs: Record<string, any>,
    reason: string,
    criticality: CapabilityCriticality = "MEDIUM",
  ): ConfirmationRequiredDecision {
    const rawToken = `cf_${Date.now()}_${crypto.randomBytes(24).toString("hex")}`
    const token = asConfirmationToken(rawToken)
    const argumentsHash = hashCanonicalArgs(validatedArgs)
    const preview = generateActionPreview(capability, validatedArgs)
    const expiresAt = Date.now() + DEFAULT_CONFIRMATION_TTL_MS

    const confirmation: ActiveConfirmation = {
      token,
      capabilityId: capability.id,
      argumentsHash,
      preview,
      reason,
      criticality,
      expiresAt,
      consumed: false,
    }

    this.tokens.set(token, confirmation)

    return {
      type: "REQUIRE_CONFIRMATION",
      token,
      preview,
      reason,
      criticality,
      expiresAt,
    }
  }

  /**
   * Validate that a supplied token is valid, unexpired, unconsumed, matches capability, and binds arguments.
   * If valid, atomically consumes the token to prevent replay.
   */
  public validateAndConsumeToken(
    token: string,
    capabilityId: CapabilityId,
    validatedArgs: Record<string, any>,
  ): { valid: boolean; reason?: string } {
    const record = this.tokens.get(token)

    if (!record) {
      return { valid: false, reason: "Confirmation token does not exist or has expired." }
    }

    if (Date.now() > record.expiresAt) {
      this.tokens.delete(token)
      return { valid: false, reason: "Confirmation token has expired. Please re-confirm." }
    }

    if (record.consumed) {
      return { valid: false, reason: "Confirmation token has already been consumed (replay rejected)." }
    }

    if (record.capabilityId !== capabilityId) {
      return {
        valid: false,
        reason: `Confirmation token was issued for "${record.capabilityId}", cannot authorize "${capabilityId}".`,
      }
    }

    const currentHash = hashCanonicalArgs(validatedArgs)
    if (record.argumentsHash !== currentHash) {
      return {
        valid: false,
        reason: "Action arguments do not match the confirmed payload (argument tampering detected).",
      }
    }

    // Mark single-use token as consumed and remove from active map
    record.consumed = true
    this.tokens.delete(token)

    return { valid: true }
  }

  /**
   * Revoke an active confirmation token.
   */
  public revokeToken(token: string): boolean {
    return this.tokens.delete(token)
  }

  /**
   * Garbage-collect expired tokens from memory.
   */
  public cleanExpiredTokens(): number {
    const now = Date.now()
    let count = 0
    for (const [token, record] of this.tokens.entries()) {
      if (now > record.expiresAt) {
        this.tokens.delete(token)
        count++
      }
    }
    return count
  }
}

// Global Policy Manager Singleton
export const actionPolicyManager = new ActionPolicyManager()

/**
 * High-level invocation gateway integrating Central Action Policy with Safe Capability Execution.
 * Guarantees that if confirmation or clarification is required, the capability handler NEVER runs.
 */
export async function authorizeAndExecuteCapability<T extends JsonValue = JsonValue>(
  capabilityOrId: CapabilityDefinition | CapabilityId | string,
  rawInput: unknown,
  authContext?: ActionAuthorizationContext,
  execContext?: CapabilityExecutionContext,
): Promise<AuthorizedExecutionResult<T>> {
  // 1. Resolve Capability
  let capability: CapabilityDefinition | undefined
  if (typeof capabilityOrId === "object" && capabilityOrId !== null && "handler" in capabilityOrId) {
    capability = capabilityOrId as CapabilityDefinition
  } else {
    const idStr = String(capabilityOrId)
    capability = capabilityRegistry.getById(idStr) ?? capabilityRegistry.getByLegacyName(idStr)
  }

  if (!capability) {
    return {
      status: "BLOCKED",
      decision: {
        type: "BLOCK",
        reason: `Capability "${String(capabilityOrId)}" not found in registry.`,
        fixAction: "Check capability ID against CapabilityRegistry.list().",
      },
    }
  }

  // 2. Schema Validation (Section C4.6: Confirmation binding occurs strictly AFTER schema validation)
  const parseResult = capability.inputSchema.safeParse(rawInput ?? {})
  if (!parseResult.success) {
    // Schema validation failed: Delegate to C3 safe boundary which formats structured INVALID_INPUT
    const failureResult = await executeCapabilitySafely<T>(capability, rawInput, execContext)
    return {
      status: "EXECUTED",
      result: failureResult,
    }
  }

  // 3. Central Policy Evaluation
  const decision = actionPolicyManager.evaluatePolicy(capability, parseResult.data, authContext)

  if (decision.type === "REQUIRE_CONFIRMATION") {
    return {
      status: "CONFIRMATION_REQUIRED",
      decision,
    }
  }

  if (decision.type === "REQUIRE_CLARIFICATION") {
    return {
      status: "CLARIFICATION_REQUIRED",
      decision,
    }
  }

  if (decision.type === "BLOCK") {
    return {
      status: "BLOCKED",
      decision,
    }
  }

  // 4. Execution ALLOWED: invoke safe execution boundary
  const executionResult = await executeCapabilitySafely<T>(capability, parseResult.data, execContext)
  return {
    status: "EXECUTED",
    result: executionResult,
  }
}
