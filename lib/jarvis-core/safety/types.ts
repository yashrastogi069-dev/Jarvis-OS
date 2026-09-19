/**
 * JARVIS CORE V2 — CENTRAL ACTION SAFETY & CONFIRMATION POLICY CONTRACTS
 * 
 * Checkpoint: C4 (Milestone 0)
 * Status: Authoritative Safety Policy Types
 * 
 * Architectural Invariants:
 * 1. Runtime Controls Authorization: LLM cannot authorize itself; { confirmed: true }
 *    in model arguments has ZERO authority.
 * 2. Discriminated Policy Decisions: Every policy evaluation deterministically yields
 *    ALLOW, REQUIRE_CONFIRMATION, REQUIRE_CLARIFICATION, or BLOCK.
 * 3. Strong Cryptographic Tokens: ConfirmationTokens are unforgeable, single-use,
 *    expiring, and bound to the exact canonical SHA-256 hash of validated arguments.
 * 4. Framework Independence: ZERO imports from React, Next.js, or ToolLoopAgent.
 */

import type { CapabilityId, JsonValue } from "../types"
import type { CapabilityCriticality } from "../capabilities/types"
import type { CapabilityResult } from "../capabilities/result"

export type ConfirmationToken = string & { readonly __brand: "ConfirmationToken" }
export const asConfirmationToken = (token: string): ConfirmationToken => token as ConfirmationToken

export interface ActionPreview {
  readonly capabilityId: CapabilityId
  readonly targetDomain: string
  readonly summary: string
  readonly details: Record<string, string | number | boolean | null>
  readonly warning?: string
}

export interface AllowDecision {
  readonly type: "ALLOW"
  readonly reason?: string
}

export interface ConfirmationRequiredDecision {
  readonly type: "REQUIRE_CONFIRMATION"
  readonly token: ConfirmationToken
  readonly preview: ActionPreview
  readonly reason: string
  readonly criticality: CapabilityCriticality
  readonly expiresAt: number
}

export interface ClarificationRequiredDecision {
  readonly type: "REQUIRE_CLARIFICATION"
  readonly reason: string
  readonly missingFields?: ReadonlyArray<string>
  readonly prompt: string
}

export interface BlockDecision {
  readonly type: "BLOCK"
  readonly reason: string
  readonly fixAction?: string
}

export type PolicyDecision =
  | AllowDecision
  | ConfirmationRequiredDecision
  | ClarificationRequiredDecision
  | BlockDecision

export interface ActionAuthorizationContext {
  readonly confirmationToken?: string
  readonly userId?: string
}

export type AuthorizedExecutionResult<T extends JsonValue = JsonValue> =
  | { readonly status: "EXECUTED"; readonly result: CapabilityResult<T> }
  | { readonly status: "CONFIRMATION_REQUIRED"; readonly decision: ConfirmationRequiredDecision }
  | { readonly status: "CLARIFICATION_REQUIRED"; readonly decision: ClarificationRequiredDecision }
  | { readonly status: "BLOCKED"; readonly decision: BlockDecision }
