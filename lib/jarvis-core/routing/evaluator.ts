/**
 * JARVIS CORE V2 — CAPABILITY ROUTER EVALUATOR
 * 
 * Checkpoint C7: Offline & shadow evaluation utility to benchmark capability router
 * accuracy, recall, false exclusions, latency, and token reduction across test corpora.
 */

import { capabilityRouter, CapabilityRouter } from "./router"
import type { RoutingCorpusItem, RoutingEvaluationResult } from "./types"

const AVG_TOKENS_PER_TOOL = 175
const TOTAL_TOOLS_V1 = 47

export class CapabilityRouterEvaluator {
  private readonly router: CapabilityRouter

  constructor(router: CapabilityRouter = capabilityRouter) {
    this.router = router
  }

  /**
   * Evaluate router performance on a given test corpus.
   */
  public evaluate(corpus: ReadonlyArray<RoutingCorpusItem>): RoutingEvaluationResult {
    let totalExpectedTools = 0
    let totalMatchedTools = 0
    let totalToolsExposed = 0
    let totalLatency = 0
    let expectedDomainsCount = 0
    let matchedDomainsCount = 0

    const falseExclusions: Array<{
      promptId: string
      prompt: string
      missingTool: string
      exposedTools: ReadonlyArray<string>
    }> = []

    for (const item of corpus) {
      const decision = this.router.route(item.prompt)
      totalLatency += decision.latencyMs
      totalToolsExposed += decision.selectedLegacyToolNames.length

      const exposedSet = new Set(decision.selectedLegacyToolNames)

      // Evaluate tool recall
      for (const expectedTool of item.expectedTools) {
        totalExpectedTools++
        if (exposedSet.has(expectedTool)) {
          totalMatchedTools++
        } else {
          falseExclusions.push({
            promptId: item.id,
            prompt: item.prompt,
            missingTool: expectedTool,
            exposedTools: decision.selectedLegacyToolNames,
          })
        }
      }

      // Evaluate domain recall
      if (item.expectedTools.length > 0) {
        expectedDomainsCount++
        const matched = item.expectedTools.some((exp) => exposedSet.has(exp))
        if (matched) {
          matchedDomainsCount++
        }
      }
    }

    const totalPrompts = corpus.length
    const toolRecallPct =
      totalExpectedTools > 0
        ? Number(((totalMatchedTools / totalExpectedTools) * 100).toFixed(2))
        : 100
    const domainRecallPct =
      expectedDomainsCount > 0
        ? Number(((matchedDomainsCount / expectedDomainsCount) * 100).toFixed(2))
        : 100
    const avgToolsExposed =
      totalPrompts > 0 ? Number((totalToolsExposed / totalPrompts).toFixed(2)) : 0
    const avgSchemaTokens = Math.round(avgToolsExposed * AVG_TOKENS_PER_TOOL)
    const baselineTokens = TOTAL_TOOLS_V1 * AVG_TOKENS_PER_TOOL
    const tokenReductionPct = Number(
      ((1 - avgSchemaTokens / baselineTokens) * 100).toFixed(1)
    )
    const avgLatencyMs =
      totalPrompts > 0 ? Number((totalLatency / totalPrompts).toFixed(3)) : 0

    // Target invariant: >= 99.5% tool recall on fixed corpus
    const targetMet = toolRecallPct >= 99.5

    return {
      totalPrompts,
      totalExpectedTools,
      totalMatchedTools,
      toolRecallPct,
      domainRecallPct,
      avgToolsExposed,
      avgSchemaTokens,
      tokenReductionPct,
      avgLatencyMs,
      falseExclusionsCount: falseExclusions.length,
      falseExclusions,
      targetMet,
    }
  }
}

export const routerEvaluator = new CapabilityRouterEvaluator()
