/**
 * JARVIS CORE V2 — CAPABILITY ROUTER
 * 
 * Checkpoint C7: Layered confidence capability router with Strategy E
 * classification, safe fail-open fallback, and shadow execution.
 */

import { capabilityRegistry, CapabilityRegistry } from "../capabilities/registry"
import type { CapabilityDefinition } from "../capabilities/types"
import type { CapabilityId } from "../types"
import { classifyStrategyE, CORE_DOMAINS, ALL_DOMAINS } from "./strategy-e"
import type { CapabilityRouterOptions, RoutingDecision } from "./types"

export class CapabilityRouter {
  private readonly registry: CapabilityRegistry
  private readonly defaultOptions: Required<CapabilityRouterOptions>

  constructor(
    registry: CapabilityRegistry = capabilityRegistry,
    defaultOptions?: CapabilityRouterOptions
  ) {
    this.registry = registry
    this.defaultOptions = {
      shadowMode: defaultOptions?.shadowMode ?? false,
      maxToolsTarget: defaultOptions?.maxToolsTarget ?? 12,
      confidenceThreshold: defaultOptions?.confidenceThreshold ?? 0.70,
      enableFallback: defaultOptions?.enableFallback ?? true,
      fallbackStrategy: defaultOptions?.fallbackStrategy ?? "CORE_DOMAINS",
    }
  }

  /**
   * Route a user prompt to a filtered, high-relevance set of capabilities.
   */
  public route(
    prompt: string,
    overrideOptions?: Partial<CapabilityRouterOptions>
  ): RoutingDecision {
    const t0 = performance.now()
    const options: Required<CapabilityRouterOptions> = {
      ...this.defaultOptions,
      ...overrideOptions,
    }

    const classification = classifyStrategyE(prompt, options)
    const selectedCapabilities: CapabilityDefinition[] = []

    if (classification.domains.length > 0) {
      const allDefinitions = this.registry.getAll()
      const domainSet = new Set(classification.domains)

      for (const cap of allDefinitions) {
        if (domainSet.has(cap.domain)) {
          selectedCapabilities.push(cap)
        }
      }
    }

    const latencyMs = Number((performance.now() - t0).toFixed(3))

    return {
      selectedCapabilities,
      selectedCapabilityIds: selectedCapabilities.map((c) => c.id),
      selectedLegacyToolNames: selectedCapabilities.map((c) => c.legacyToolName),
      domains: classification.domains,
      confidence: classification.confidence,
      reason: classification.reason,
      isFallback: classification.isFallback,
      shadowOnly: options.shadowMode,
      latencyMs,
    }
  }

  /**
   * Return filtered capability definitions for direct agent consumption.
   */
  public getCapabilities(
    prompt: string,
    overrideOptions?: Partial<CapabilityRouterOptions>
  ): ReadonlyArray<CapabilityDefinition> {
    const decision = this.route(prompt, overrideOptions)
    return decision.selectedCapabilities
  }

  /**
   * Return filtered V1-compatible AI SDK tools for execution.
   */
  public getTools(
    prompt: string,
    overrideOptions?: Partial<CapabilityRouterOptions>
  ): Record<string, unknown> {
    const decision = this.route(prompt, overrideOptions)
    const tools: Record<string, unknown> = {}

    for (const cap of decision.selectedCapabilities) {
      tools[cap.legacyToolName] = this.registry.toAiSdkTool(cap)
    }

    return tools
  }
}

export const capabilityRouter = new CapabilityRouter()
