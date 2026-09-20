/**
 * JARVIS CORE V2 — STRUCTURED DAG PLANNER TYPES
 * 
 * Checkpoint C9: Typed representations for multi-step execution plans,
 * deterministic step-output references, completion criteria, and model adapter boundaries.
 */

import type {
  CapabilityId,
  JsonValue,
  PlanId,
  PlanStepId,
  QuestId,
  TraceId,
} from "../types"
import type { IntentAnalysisResult } from "../intent/types"
import type { CapabilityDefinition } from "../capabilities/types"

export type CapabilityDescriptor =
  | CapabilityDefinition
  | {
      readonly id: CapabilityId
      readonly description: string
      readonly domain?: string
      readonly actionClass?: string
      readonly inputSchema?: unknown
    }


// ============================================================================
// 1. COMPLETION CRITERIA
// ============================================================================

export type CompletionCriterionType =
  | "CAPABILITY_SUCCEEDED"
  | "OUTPUT_PRESENT"
  | "DEPENDENCY_RESOLVED"
  | "CONFIRMATION_ACCEPTED"

export interface CompletionCriterion {
  readonly type: CompletionCriterionType
  readonly path?: string
  readonly description?: string
}

// ============================================================================
// 2. TYPED STEP OUTPUT REFERENCES (Section 5.4)
// ============================================================================

export interface StepOutputReference {
  readonly stepId: PlanStepId
  readonly path: string // JSON pointer (RFC 6901), e.g. "/id" or "/items/0/id"
}

export type StructuredArgumentValue =
  | string
  | number
  | boolean
  | null
  | { readonly $ref: StepOutputReference }
  | ReadonlyArray<StructuredArgumentValue>
  | { readonly [key: string]: StructuredArgumentValue }

export type StructuredArguments = Record<string, StructuredArgumentValue>

// ============================================================================
// 3. PLAN & STEP DEFINITIONS (Section 5.2)
// ============================================================================

export interface PlannerStep {
  readonly id: PlanStepId
  readonly objective: string
  readonly capabilityId: CapabilityId
  readonly arguments: StructuredArguments
  readonly dependsOn: ReadonlyArray<PlanStepId>
  readonly completionCriteria: ReadonlyArray<CompletionCriterion>
  readonly required: boolean
}

export interface ExecutionPlan {
  readonly id: PlanId
  readonly questId: QuestId
  readonly traceId: TraceId
  readonly objective: string
  readonly version: number
  readonly steps: ReadonlyArray<PlannerStep>
  readonly createdAt: number
}

// ============================================================================
// 4. PLANNER INPUT & LIMITS (Sections 5.1 & 5.6)
// ============================================================================

export interface PlannerInput {
  readonly questId: QuestId
  readonly traceId: TraceId
  readonly objective: string
  readonly capabilities: ReadonlyArray<CapabilityDescriptor>
  readonly conversationContext?: ReadonlyArray<{ readonly role: string; readonly content: string }>
  readonly resolvedIntent?: IntentAnalysisResult
  readonly connectorState?: Record<string, unknown>
  readonly existingPlan?: ExecutionPlan
  readonly replanReason?: string
}

export const PLAN_LIMITS = {
  MAX_STEPS: 10,
  MAX_DEPTH: 5,
  MAX_FAN_OUT: 5,
  MAX_DEPENDENCIES_PER_STEP: 5,
  MAX_SERIALIZED_BYTES: 32768, // 32 KB
} as const

// ============================================================================
// 5. PROVIDER-INDEPENDENT MODEL ADAPTER (Section 5.8)
// ============================================================================

export interface PlannerModelAdapter {
  generatePlan(
    prompt: string,
    schema: unknown,
    options?: { readonly signal?: AbortSignal }
  ): Promise<unknown>
}

// ============================================================================
// 6. PLANNER RESULT & ERROR ENVELOPE
// ============================================================================

export type PlannerErrorCode =
  | "INVALID_MODEL_OUTPUT"
  | "SCHEMA_VIOLATION"
  | "CAPABILITY_NOT_ROUTED"
  | "PLAN_LIMIT_EXCEEDED"
  | "CYCLIC_DEPENDENCY"
  | "INVALID_REFERENCE"
  | "MODEL_FAILURE"

export interface PlannerError {
  readonly code: PlannerErrorCode
  readonly message: string
  readonly details?: unknown
}

export type PlannerResult =
  | { readonly success: true; readonly plan: ExecutionPlan }
  | { readonly success: false; readonly error: PlannerError }
