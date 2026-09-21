/**
 * JARVIS CORE V2 — PROVIDER-ROLE ROUTER & ADAPTER TYPES
 * 
 * Checkpoint: C14 (Section C14.1)
 * Status: Authoritative Provider Routing & Model Contract
 * 
 * Architectural Invariants:
 * 1. Provider Independence: Core runtime interacts strictly with ModelAdapter interfaces,
 *    never binding directly to specific cloud vendor SDKs.
 * 2. Role Specialization: Models are mapped to explicit roles:
 *    - CHAT: Low latency conversational interaction
 *    - ACTION_RESOLVER: Precision argument extraction and candidate synthesis
 *    - PLANNER: High reasoning DAG decomposition and topological ordering
 *    - REPLANNER: Dynamic patch generation and cycle/loop avoidance
 *    - FINALIZER: Grounded, truthful summarization from ledger facts
 * 3. Zero Model Authority: Models cannot authorize actions, bypass safety gates, or claim operations.
 */

import { z } from "zod"
import type { ProviderRole } from "../types"
import type { TurnDeadline } from "./deadline"

export type { ProviderRole }

export type ModelProviderId = string & { readonly __brand: "ModelProviderId" }
export const asModelProviderId = (id: string): ModelProviderId => id as ModelProviderId

export type ProviderHealthStatus = "HEALTHY" | "DEGRADED" | "COOLDOWN" | "OFFLINE"

export interface ProviderMetrics {
  readonly totalRequests: number
  readonly successfulRequests: number
  readonly failedRequests: number
  readonly consecutiveErrors: number
  readonly lastSuccessAt?: number
  readonly lastFailureAt?: number
  readonly lastError?: string
  readonly cooldownUntil?: number
  readonly p50LatencyMs: number
}

export interface RoleRoutingConfig {
  readonly role: ProviderRole
  readonly primaryProvider: string
  readonly primaryModel: string
  readonly fallbackProvider?: string
  readonly fallbackModel?: string
  readonly temperature?: number
  readonly maxTokens?: number
}

export interface ModelUsage {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly totalTokens: number
}

export interface ModelRequestOptions {
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  readonly temperature?: number
  readonly maxTokens?: number
  readonly systemPrompt?: string
  readonly deadline?: TurnDeadline
  readonly modelOverride?: string
}

export interface ModelResponse {
  readonly text: string
  readonly model: string
  readonly providerId: string
  readonly usage?: ModelUsage
  readonly latencyMs: number
}

export interface ObjectGenerationResult<T> {
  readonly object: T
  readonly response: ModelResponse
}

export interface ModelAdapter {
  readonly providerId: string
  readonly displayName: string
  isAvailable(): boolean
  generateText(prompt: string, options?: ModelRequestOptions): Promise<ModelResponse>
  generateObject<T>(prompt: string, schema: z.ZodType<T>, options?: ModelRequestOptions): Promise<ObjectGenerationResult<T>>
}
