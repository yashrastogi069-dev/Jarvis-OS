/**
 * JARVIS CORE V2 — GROUNDED FINALIZER TYPES
 * 
 * Checkpoint: C15 (Section C15.1)
 * Status: Authoritative Finalization & Response Synthesis Contract
 * 
 * Architectural Invariants:
 * 1. Grounded Facts Only: The finalizer receives structured facts extracted from the
 *    OperationLedger, step execution results, and safety confirmations.
 * 2. Zero Model Authority: The finalizer has ZERO tool-calling capabilities. It cannot
 *    mutate system state or execute actions.
 * 3. Anti-Hallucination: If an operation is not in the ledger with COMMITTED/SUCCEEDED,
 *    the finalizer is strictly prohibited from claiming completion.
 * 4. Deterministic Fallback: If model generation is unavailable or times out, a deterministic
 *    synthesizer guarantees a truthful response.
 */

import type { OperationLedgerRecord } from "../ledger/types"
import type { StepStatus } from "../types"

export type FinalizerExecutionMode = "DIRECT_ACTION" | "PLAN_DAG" | "CONVERSATIONAL"

export type FinalizerTurnStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "PARTIAL"
  | "CONFIRMATION_REQUIRED"
  | "CANCELLED"

export interface StepFact {
  readonly stepId: string
  readonly capabilityId: string
  readonly title: string
  readonly status: StepStatus | "SUCCEEDED" | "FAILED"
  readonly summary?: string
  readonly error?: string
  readonly result?: any
}

export interface PendingConfirmationFact {
  readonly capabilityId: string
  readonly title: string
  readonly parameters: Record<string, any>
  readonly impactLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  readonly reason: string
  readonly confirmationToken?: string
}

export interface FinalizationFacts {
  readonly turnId: string
  readonly userMessage: string
  readonly executionMode: FinalizerExecutionMode
  readonly turnStatus: FinalizerTurnStatus
  readonly goal?: string
  readonly steps: ReadonlyArray<StepFact>
  readonly committedOperations: ReadonlyArray<OperationLedgerRecord>
  readonly pendingConfirmation?: PendingConfirmationFact
  readonly error?: string
  readonly contextNotes?: ReadonlyArray<string>
}

export interface FinalizerResponse {
  readonly text: string
  readonly grounded: boolean
  readonly turnStatus: FinalizerTurnStatus
  readonly factsSummary: {
    readonly totalSteps: number
    readonly succeededSteps: number
    readonly failedSteps: number
    readonly committedOperations: number
  }
  readonly synthesizer: "MODEL" | "DETERMINISTIC_FALLBACK"
  readonly redactedSecretsCount: number
}
