/**
 * JARVIS CORE V2 — CORE RUNTIME TYPES
 * 
 * Checkpoint: C16 (Section C16.5)
 * Status: Authoritative Core Runtime Contract
 */

import type {
  CapabilityId,
  JsonValue,
  PlanStepId,
  RuntimeErrorEnvelope,
  TurnId,
} from "../types"
import type { FinalizationFacts, FinalizerResponse, FinalizerTurnStatus } from "../finalizer/types"
import type { ConfirmationToken } from "../safety/types"
import type { CoreStreamEvent, StreamSink } from "../streaming/types"

export interface RuntimeTurnInput {
  readonly userMessage: string
  readonly sessionId?: string
  readonly turnId?: TurnId
  readonly budgetMs?: number
  readonly softBufferMs?: number
  readonly signal?: AbortSignal
  readonly confirmationToken?: ConfirmationToken
  readonly confirmedStepId?: PlanStepId
  readonly streamSink?: StreamSink
}

export interface RuntimeTurnResult {
  readonly turnId: TurnId
  readonly status: FinalizerTurnStatus
  readonly responseText: string
  readonly finalizerResponse: FinalizerResponse
  readonly facts: FinalizationFacts
  readonly durationMs: number
  readonly events: ReadonlyArray<CoreStreamEvent>
  readonly error?: RuntimeErrorEnvelope
}
