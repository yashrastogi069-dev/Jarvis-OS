/**
 * JARVIS CORE V2 — STRUCTURED STREAMING & SSE EVENT CONTRACTS
 * 
 * Checkpoint: C16 (Section C16.1)
 * Status: Authoritative Streaming Type Definitions
 * 
 * Architectural Invariants:
 * 1. Monotonic Event Sequencing: Every event receives a monotonically increasing numeric ID
 *    to enable reliable SSE client reconnection without lost states.
 * 2. Strict Serialization: All payloads are JSON-safe with zero undefined values or circular refs.
 * 3. Structured Lifecycle: Events demarcate every phase of the turn:
 *    turn_started -> stage_changed -> intent_classified -> plan_created ->
 *    step_started -> step_progress -> step_completed -> confirmation_required ->
 *    response_chunk -> turn_completed | error.
 */

import type { CapabilityId, PlanStepId, TurnId, TurnStatus } from "../types"
import type { FinalizerTurnStatus } from "../finalizer/types"

export type CoreStreamEventType =
  | "turn_started"
  | "stage_changed"
  | "intent_classified"
  | "plan_created"
  | "step_started"
  | "step_progress"
  | "step_completed"
  | "confirmation_required"
  | "response_chunk"
  | "turn_completed"
  | "error"

export type RuntimePipelineStage =
  | "INITIALIZING"
  | "CLASSIFYING"
  | "ROUTING"
  | "PLANNING"
  | "EXECUTING"
  | "FINALIZING"
  | "COMPLETED"
  | "FAILED"

export interface TurnStartedPayload {
  readonly turnId: TurnId
  readonly userMessage: string
  readonly timestamp: number
}

export interface StageChangedPayload {
  readonly stage: RuntimePipelineStage
  readonly elapsedMs: number
  readonly remainingMs: number
  readonly isSoftExpired: boolean
}

export interface IntentClassifiedPayload {
  readonly intent: string
  readonly mode: "CHAT" | "READ" | "ACTION" | "DAG_PLAN" | "NEEDS_CLARIFICATION"
  readonly confidence: number
  readonly primaryCapabilityId?: CapabilityId
}

export interface PlanCreatedPayload {
  readonly planId: string
  readonly objective: string
  readonly stepCount: number
  readonly steps: ReadonlyArray<{
    readonly stepId: PlanStepId
    readonly capabilityId: CapabilityId
    readonly objective: string
    readonly dependsOn: ReadonlyArray<PlanStepId>
  }>
}

export interface StepStartedPayload {
  readonly stepId: PlanStepId
  readonly capabilityId: CapabilityId
  readonly title: string
}

export interface StepProgressPayload {
  readonly stepId: PlanStepId
  readonly message: string
  readonly percent?: number
}

export interface StepCompletedPayload {
  readonly stepId: PlanStepId
  readonly capabilityId: CapabilityId
  readonly status: "COMPLETED" | "FAILED" | "BLOCKED" | "CANCELLED"
  readonly durationMs: number
  readonly summary?: string
  readonly error?: string
}

export interface ConfirmationRequiredPayload {
  readonly capabilityId: CapabilityId
  readonly title: string
  readonly impactLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  readonly reason: string
  readonly parameters: Record<string, unknown>
  readonly confirmationToken?: string
}

export interface ResponseChunkPayload {
  readonly delta: string
  readonly index: number
}

export interface TurnCompletedPayload {
  readonly turnId: TurnId
  readonly status: FinalizerTurnStatus
  readonly responseText: string
  readonly durationMs: number
  readonly stats: {
    readonly totalSteps: number
    readonly succeededSteps: number
    readonly failedSteps: number
    readonly committedOperations: number
  }
}

export interface ErrorPayload {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly stage?: RuntimePipelineStage
}

export interface CoreStreamEvent<T = unknown> {
  readonly id: number
  readonly event: CoreStreamEventType
  readonly timestamp: number
  readonly data: T
}

export interface StreamSink {
  write(event: CoreStreamEvent): void
  close(): void
}
