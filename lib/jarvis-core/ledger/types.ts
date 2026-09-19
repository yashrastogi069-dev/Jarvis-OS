/**
 * JARVIS CORE V2 — PERSISTENT OPERATION LEDGER TYPES & CONTRACTS
 * 
 * Checkpoint: C5 (Sections C5.1 – C5.12)
 * Status: Authoritative Persistent Operation Ledger Contracts
 * 
 * Architectural Invariants:
 * 1. Runtime-Owned Ledger: SQLite-persisted `operations` table tracks all mutations.
 * 2. Logical Idempotency: Cached results returned for repeated idempotent actions within window.
 * 3. Concurrent Execution Guard: Blocks simultaneous runs of non-idempotent actions with CONFLICT.
 * 4. Preservation of Uncertainty: Operations with UNKNOWN_COMMIT block automated replays.
 * 5. Crash Recovery: Crashed RUNNING states transition cleanly to UNKNOWN_COMMIT or FAILED_RETRYABLE.
 * 6. Framework Independence: Zero coupling to React, Next.js, or ToolLoopAgent.
 */

import type { CapabilityId, JsonValue, ActionClass, IdempotencyClass } from "../types"

export type OperationStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED_RETRYABLE"
  | "FAILED_FINAL"
  | "UNKNOWN_COMMIT"

export type OperationId = string & { readonly __brand: "OperationId" }
export const asOperationId = (id: string): OperationId => id as OperationId

export type DedupeKey = string & { readonly __brand: "DedupeKey" }
export const asDedupeKey = (key: string): DedupeKey => key as DedupeKey

export interface OperationRecord {
  readonly operationId: OperationId
  readonly dedupeKey: DedupeKey
  readonly capabilityId: CapabilityId
  readonly actionClass: ActionClass
  readonly status: OperationStatus
  readonly inputHash: string
  readonly inputPayload?: JsonValue
  readonly resultPayload?: JsonValue
  readonly errorCode?: string
  readonly errorMessage?: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly completedAt?: number
  readonly questId?: string
  readonly stepId?: string
}

export type OperationClaimResult =
  | { readonly status: "CLAIMED"; readonly operationId: OperationId; readonly dedupeKey: DedupeKey }
  | { readonly status: "CACHED"; readonly record: OperationRecord; readonly resultPayload: JsonValue }
  | { readonly status: "CONFLICT"; readonly reason: string; readonly operationId: OperationId }
  | { readonly status: "UNKNOWN_COMMIT"; readonly reason: string; readonly operationId: OperationId }
  | { readonly status: "FAILED_FINAL"; readonly reason: string; readonly operationId: OperationId }

export interface ClaimOperationOptions {
  readonly capabilityId: CapabilityId
  readonly actionClass: ActionClass
  readonly idempotencyClass: IdempotencyClass
  readonly input: unknown
  readonly actor?: string
  readonly questId?: string
  readonly stepId?: string
  readonly idempotencyWindowMs?: number
}

export interface CompleteOperationOptions {
  readonly operationId: OperationId
  readonly resultPayload: JsonValue
}

export interface FailOperationOptions {
  readonly operationId: OperationId
  readonly errorCode: string
  readonly errorMessage: string
  readonly isRetryable: boolean
  readonly isUnknownCommit?: boolean
}
