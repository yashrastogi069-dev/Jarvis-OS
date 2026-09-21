/**
 * JARVIS CORE V2 — SSE EVENT FACTORY & FORMATTER
 * 
 * Checkpoint: C16 (Section C16.2)
 * Status: Authoritative Event Generator and SSE Serializer
 * 
 * Architectural Invariants:
 * 1. Wire Format Compliance: Emits strict W3C Server-Sent Events standard format:
 *    id: <id>\nevent: <name>\ndata: <json>\n\n
 * 2. High Serialization Safety: Catches any serialization errors and wraps them safely.
 */

import type {
  ConfirmationRequiredPayload,
  CoreStreamEvent,
  ErrorPayload,
  IntentClassifiedPayload,
  PlanCreatedPayload,
  ResponseChunkPayload,
  RuntimePipelineStage,
  StageChangedPayload,
  StepCompletedPayload,
  StepProgressPayload,
  StepStartedPayload,
  TurnCompletedPayload,
  TurnStartedPayload,
} from "./types"

/**
 * Format a CoreStreamEvent into an SSE wire protocol string.
 */
export function formatSseMessage(event: CoreStreamEvent): string {
  let jsonData: string
  try {
    jsonData = JSON.stringify(event.data)
  } catch (err) {
    jsonData = JSON.stringify({
      error: "SerializationFailure",
      message: err instanceof Error ? err.message : String(err),
    })
  }

  return `id: ${event.id}\nevent: ${event.event}\ndata: ${jsonData}\n\n`
}

export function createTurnStartedEvent(
  id: number,
  payload: TurnStartedPayload
): CoreStreamEvent<TurnStartedPayload> {
  return { id, event: "turn_started", timestamp: Date.now(), data: payload }
}

export function createStageChangedEvent(
  id: number,
  payload: StageChangedPayload
): CoreStreamEvent<StageChangedPayload> {
  return { id, event: "stage_changed", timestamp: Date.now(), data: payload }
}

export function createIntentClassifiedEvent(
  id: number,
  payload: IntentClassifiedPayload
): CoreStreamEvent<IntentClassifiedPayload> {
  return { id, event: "intent_classified", timestamp: Date.now(), data: payload }
}

export function createPlanCreatedEvent(
  id: number,
  payload: PlanCreatedPayload
): CoreStreamEvent<PlanCreatedPayload> {
  return { id, event: "plan_created", timestamp: Date.now(), data: payload }
}

export function createStepStartedEvent(
  id: number,
  payload: StepStartedPayload
): CoreStreamEvent<StepStartedPayload> {
  return { id, event: "step_started", timestamp: Date.now(), data: payload }
}

export function createStepProgressEvent(
  id: number,
  payload: StepProgressPayload
): CoreStreamEvent<StepProgressPayload> {
  return { id, event: "step_progress", timestamp: Date.now(), data: payload }
}

export function createStepCompletedEvent(
  id: number,
  payload: StepCompletedPayload
): CoreStreamEvent<StepCompletedPayload> {
  return { id, event: "step_completed", timestamp: Date.now(), data: payload }
}

export function createConfirmationRequiredEvent(
  id: number,
  payload: ConfirmationRequiredPayload
): CoreStreamEvent<ConfirmationRequiredPayload> {
  return { id, event: "confirmation_required", timestamp: Date.now(), data: payload }
}

export function createResponseChunkEvent(
  id: number,
  payload: ResponseChunkPayload
): CoreStreamEvent<ResponseChunkPayload> {
  return { id, event: "response_chunk", timestamp: Date.now(), data: payload }
}

export function createTurnCompletedEvent(
  id: number,
  payload: TurnCompletedPayload
): CoreStreamEvent<TurnCompletedPayload> {
  return { id, event: "turn_completed", timestamp: Date.now(), data: payload }
}

export function createErrorEvent(
  id: number,
  payload: ErrorPayload
): CoreStreamEvent<ErrorPayload> {
  return { id, event: "error", timestamp: Date.now(), data: payload }
}
