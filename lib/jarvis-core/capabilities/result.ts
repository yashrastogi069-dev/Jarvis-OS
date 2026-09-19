/**
 * JARVIS CORE V2 — STRUCTURED CAPABILITY RESULT CONTRACTS
 * 
 * Checkpoint: C3 (Milestone 0)
 * Status: Authoritative Execution Boundary Contracts
 * 
 * Architectural Invariants:
 * 1. Deterministic JSON Safety: Every CapabilityResult uses JsonValue / JsonObject
 *    from `lib/jarvis-core/types.ts`. Raw Errors or unhandled types never cross the boundary.
 * 2. Discriminated Union: Success vs Failure is strictly typed via `result.success`.
 * 3. Structured Error Taxonomy: Finite semantic error codes with safe human messages,
 *    clear fix actions, and context-aware retry hints.
 * 4. Mutation Uncertainty: Preserves UNKNOWN_COMMIT distinction for uncertain external mutations.
 * 5. Framework Independence: ZERO imports from React, Next.js, or ToolLoopAgent.
 */

import type { CapabilityId, TraceId, TraceContext, JsonValue, JsonObject } from "../types"

// ============================================================================
// 1. ERROR TAXONOMY & CODES (Section 6)
// ============================================================================

export type CapabilityErrorCode =
  | "INVALID_INPUT"        // Malformed arguments, schema validation failure, missing required fields
  | "UNCONFIGURED"         // Connector credentials or local service configuration missing
  | "AUTH_REQUIRED"        // OAuth token expired, invalid PAT, or authentication failure
  | "PERMISSION_DENIED"    // Insufficient privileges or forbidden access
  | "NOT_FOUND"            // Target entity (task, memory, skill, note, event) does not exist
  | "CONFLICT"             // State conflict (e.g. concurrent modification or incompatible state)
  | "ALREADY_EXISTS"       // Unique constraint collision (e.g. duplicate wake word, duplicate skill name)
  | "RATE_LIMITED"         // Upstream API rate limit exceeded (HTTP 429)
  | "TIMEOUT"              // Request timed out before completion
  | "NETWORK_ERROR"        // Transport/network failure before commit
  | "SERVICE_UNAVAILABLE"  // Local sidecar or remote server unreachable (503, connection refused)
  | "CANCELLED"            // Explicitly aborted by client or signal
  | "UNKNOWN_COMMIT"       // Side effect dispatched, but confirmation dropped/timed out; status uncertain
  | "INTERNAL_ERROR"       // Unhandled programming defect or runtime invariant failure

// ============================================================================
// 2. RETRY HINT VOCABULARY (Section 7)
// ============================================================================

/**
 * Context-sensitive retry guidance.
 * C3 exposes this advice; actual retries are strictly managed by C5/C14.
 */
export type RetryHint =
  | "DO_NOT_RETRY"     // Permanent failure; repeat call will fail identically
  | "SAFE_TO_RETRY"    // Idempotent read or transient failure safe to retry automatically
  | "REQUIRES_POLICY"  // Mutation state uncertain; requires verification/policy before replay

// ============================================================================
// 3. CAPABILITY ERROR CONTRACT
// ============================================================================

export interface CapabilityError {
  readonly code: CapabilityErrorCode
  readonly message: string
  readonly retryHint: RetryHint
  readonly fixAction?: string
  readonly details?: JsonObject
}

// ============================================================================
// 4. EXECUTION METADATA & CONTEXT (Section 9 & 10)
// ============================================================================

export interface CapabilityExecutionMetadata {
  readonly traceId: TraceId
  readonly capabilityId: CapabilityId
  readonly durationMs: number
  readonly attempt: number
  readonly remoteRequestId?: string
}

export interface CapabilityExecutionContext {
  readonly trace?: TraceContext
  readonly attempt?: number
  readonly signal?: AbortSignal
}

// ============================================================================
// 5. CAPABILITY RESULT CONTRACT (Section 5)
// ============================================================================

export interface CapabilitySuccess<T extends JsonValue = JsonValue> {
  readonly success: true
  readonly data: T
  readonly metadata: CapabilityExecutionMetadata
}

export interface CapabilityFailure {
  readonly success: false
  readonly error: CapabilityError
  readonly metadata: CapabilityExecutionMetadata
}

export type CapabilityResult<T extends JsonValue = JsonValue> =
  | CapabilitySuccess<T>
  | CapabilityFailure

// ============================================================================
// 6. INTERNAL OPERATIONAL ERROR HELPER (Section 13)
// ============================================================================

export class CapabilityOperationalError extends Error {
  public readonly code: CapabilityErrorCode
  public readonly retryHint: RetryHint
  public readonly fixAction?: string
  public readonly details?: JsonObject

  constructor(opts: {
    code: CapabilityErrorCode
    message: string
    retryHint?: RetryHint
    fixAction?: string
    details?: JsonObject
    cause?: unknown
  }) {
    super(opts.message)
    this.name = "CapabilityOperationalError"
    this.code = opts.code
    this.retryHint = opts.retryHint ?? (opts.code === "RATE_LIMITED" ? "SAFE_TO_RETRY" : "DO_NOT_RETRY")
    this.fixAction = opts.fixAction
    this.details = opts.details
    if (opts.cause) this.cause = opts.cause
  }
}
