/**
 * JARVIS CORE V2 — DIRECT ACTION RUNTIME TYPES
 * 
 * Checkpoint: Pre-Phase-4 Repair Gate E
 * Provider-independent simple ACTION argument resolution and execution controller.
 */

import type { CapabilityId, JsonValue, OperationId, TraceId, TurnId } from "../types"
import type { CapabilityDefinition } from "../capabilities/types"
import type { ActionPreview, ConfirmationToken } from "../safety/types"

export type ActionResolutionStatus = "RESOLVED" | "NEEDS_CLARIFICATION" | "INVALID"

export interface ActionResolutionResult {
  readonly status: ActionResolutionStatus
  readonly capabilityId: CapabilityId
  readonly candidateArguments?: Record<string, unknown>
  readonly canonicalArguments?: Record<string, unknown>
  readonly clarificationPrompt?: string
  readonly missingFields?: ReadonlyArray<string>
  readonly error?: string
}

export interface ActionArgumentResolverInput {
  readonly userRequest: string
  readonly capabilityId: CapabilityId
  readonly capability: CapabilityDefinition
  readonly conversationContext?: ReadonlyArray<{ readonly role: string; readonly content: string }>
}

export interface ActionArgumentModel {
  resolveArguments(input: ActionArgumentResolverInput): Promise<Record<string, unknown> | null>
}

export interface ActionExecutionOptions {
  readonly actor?: string
  readonly confirmationToken?: string
  readonly signal?: AbortSignal
  readonly modelAdapter?: ActionArgumentModel
  readonly traceId?: TraceId
}

export type ActionExecutionOutcome =
  | {
      readonly status: "COMPLETED"
      readonly turnId: TurnId
      readonly actionSlot: number
      readonly operationId: OperationId
      readonly capabilityId: CapabilityId
      readonly arguments: Record<string, unknown>
      readonly result: JsonValue | null
      readonly wasCached: boolean
    }
  | {
      readonly status: "CONFIRMATION_REQUIRED"
      readonly turnId: TurnId
      readonly actionSlot: number
      readonly capabilityId: CapabilityId
      readonly arguments: Record<string, unknown>
      readonly confirmationToken: ConfirmationToken
      readonly preview: ActionPreview
      readonly reason: string
      readonly criticality: string
    }
  | {
      readonly status: "NEEDS_CLARIFICATION"
      readonly turnId: TurnId
      readonly capabilityId: CapabilityId
      readonly prompt: string
      readonly missingFields?: ReadonlyArray<string>
    }
  | {
      readonly status: "BLOCKED"
      readonly turnId: TurnId
      readonly capabilityId: CapabilityId
      readonly reason: string
      readonly fixAction?: string
    }
  | {
      readonly status: "FAILED" | "UNKNOWN_COMMIT"
      readonly turnId: TurnId
      readonly actionSlot: number
      readonly operationId?: OperationId
      readonly capabilityId: CapabilityId
      readonly error: {
        readonly code: string
        readonly message: string
        readonly retryable: boolean
        readonly details?: unknown
      }
    }
