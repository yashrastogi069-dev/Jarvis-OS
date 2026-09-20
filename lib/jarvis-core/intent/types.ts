/**
 * JARVIS CORE V2 — INTENT ANALYSIS & AMBIGUITY TYPES
 * 
 * Checkpoint: C6 (Sections C6.1 – C6.10)
 * Status: Authoritative Intent Classification & Ambiguity Contracts
 * 
 * Invariants:
 * 1. Discriminated Outcome: IntentAnalysisResult is discriminated by needsClarification: boolean.
 * 2. Execution Category Alignment: Category matches C1 ExecutionMode (CHAT, READ, ACTION, QUEST).
 * 3. Zero Ambiguous Destructive Execution: Any destructive action with missing/vague target
 *    MUST yield needsClarification: true.
 * 4. Structured Clarifications: Missing fields, ambiguity types, and user prompts are strictly typed.
 */

import type { CapabilityDomain } from "../capabilities/types"
import type { CapabilityId, ExecutionMode } from "../types"

export type IntentKind =
  | "CONVERSATION"
  | "READ_QUERY"
  | "MUTATION_SINGLE"
  | "GOAL_MULTI_STEP"

/**
 * Reconciled with canonical ExecutionMode ("CHAT" | "READ" | "ACTION" | "QUEST").
 */
export type IntentCategory = ExecutionMode

export type AmbiguityType =
  | "MISSING_REQUIRED_FIELD"
  | "AMBIGUOUS_TARGET"
  | "CONFLICTING_INSTRUCTION"
  | "UNDER_SPECIFIED"

export interface ClarificationRequest {
  readonly ambiguityType: AmbiguityType
  readonly reason: string
  readonly prompt: string
  readonly missingFields?: ReadonlyArray<string>
  readonly options?: ReadonlyArray<string>
  readonly targetDomain?: CapabilityDomain | string
  readonly intendedAction?: string
}

export interface ResolvedIntent {
  readonly needsClarification: false
  readonly mode: ExecutionMode
  readonly category: ExecutionMode
  readonly intentKind?: IntentKind
  readonly confidence: number // 0.0 to 1.0
  readonly targetDomain?: CapabilityDomain | string
  readonly targetCapability?: CapabilityId
  readonly extractedEntities?: Record<string, any>
  readonly subgoals?: ReadonlyArray<string>
  readonly reason: string
  readonly fastPath: boolean
}

export interface ClarificationIntent {
  readonly needsClarification: true
  readonly mode: ExecutionMode
  readonly category: ExecutionMode
  readonly intentKind?: IntentKind
  readonly clarification: ClarificationRequest
  readonly reason: string
  readonly fastPath: boolean
}

export type IntentAnalysisResult = ResolvedIntent | ClarificationIntent

export interface IntentClassifierContext {
  readonly recentMessages?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>
  readonly activeTaskId?: number | string
  readonly activeQuestId?: string
}
