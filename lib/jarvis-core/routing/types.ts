/**
 * JARVIS CORE V2 — CAPABILITY ROUTER TYPES
 * 
 * Checkpoint C7: Canonical types and contracts for dynamic capability routing,
 * tool pruning, confidence assessment, and shadow evaluation.
 */

import type { CapabilityDefinition, CapabilityDomain } from "../capabilities/types"
import type { CapabilityId } from "../types"

export type FallbackStrategy = "CORE_DOMAINS" | "ALL_CAPABILITIES"

export interface CapabilityRouterOptions {
  /**
   * If true, runs router purely for observability/metrics without altering active tools.
   * Default: false
   */
  readonly shadowMode?: boolean

  /**
   * Target maximum number of exposed capabilities (heuristic budget).
   * Default: 12
   */
  readonly maxToolsTarget?: number

  /**
   * Minimum confidence required to use specific pruned domain set.
   * Below this threshold, router triggers fail-open fallback.
   * Default: 0.70
   */
  readonly confidenceThreshold?: number

  /**
   * Whether fail-open fallback is enabled when confidence is low or no domain matches.
   * Default: true
   */
  readonly enableFallback?: boolean

  /**
   * Fallback scope when triggered: core domains (tasks, memory, research, feed) or all capabilities.
   * Default: "CORE_DOMAINS"
   */
  readonly fallbackStrategy?: FallbackStrategy
}

export interface RoutingDecision {
  /**
   * Ordered list of selected capability definitions from canonical registry.
   */
  readonly selectedCapabilities: ReadonlyArray<CapabilityDefinition>

  /**
   * Set of selected Capability IDs.
   */
  readonly selectedCapabilityIds: ReadonlyArray<CapabilityId>

  /**
   * Set of selected legacy tool names for V1 compatibility (e.g. createTask, saveMemory).
   */
  readonly selectedLegacyToolNames: ReadonlyArray<string>

  /**
   * Domains that were activated for this prompt.
   */
  readonly domains: ReadonlyArray<CapabilityDomain>

  /**
   * Estimated confidence score in [0.0, 1.0].
   */
  readonly confidence: number

  /**
   * Human-readable classification explanation for audit and debugging.
   */
  readonly reason: string

  /**
   * Whether fail-open fallback was activated.
   */
  readonly isFallback: boolean

  /**
   * Whether this routing decision was produced in shadow mode.
   */
  readonly shadowOnly: boolean

  /**
   * Routing execution latency in milliseconds.
   */
  readonly latencyMs: number
}

export interface RoutingCorpusItem {
  readonly id: string
  readonly prompt: string
  readonly expectedTools: ReadonlyArray<string>
  readonly domain: string
  readonly type: string
}

export interface RoutingEvaluationResult {
  readonly totalPrompts: number
  readonly totalExpectedTools: number
  readonly totalMatchedTools: number
  readonly toolRecallPct: number
  readonly domainRecallPct: number
  readonly avgToolsExposed: number
  readonly avgSchemaTokens: number
  readonly tokenReductionPct: number
  readonly avgLatencyMs: number
  readonly falseExclusionsCount: number
  readonly falseExclusions: ReadonlyArray<{
    readonly promptId: string
    readonly prompt: string
    readonly missingTool: string
    readonly exposedTools: ReadonlyArray<string>
  }>
  readonly targetMet: boolean
}
