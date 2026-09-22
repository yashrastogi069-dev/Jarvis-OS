/**
 * JARVIS CORE V2 — RESEARCH CAPABILITY DEFINITIONS
 * 
 * Research capabilities:
 * - research.search (webSearch): Live web search via Tavily with Serper fallback
 * - research.fetch (fetchPage): Web page markdown scraping via Firecrawl
 * 
 * Total: 2 capabilities
 */

import { z } from "zod"
import { asCapabilityId } from "../../types"
import type { CapabilityDefinition } from "../types"
import { webSearch, fetchPage } from "@/lib/research"

export const researchCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("research.search"),
    legacyToolName: "webSearch",
    domain: "research",
    title: "Web Search",
    description:
      "Search the live web for current information: latest versions, recent news, facts, docs, or anything you are unsure about. Returns ranked results with title, url, and snippet. Use this instead of guessing about recent or factual matters.",
    inputSchema: z.object({
      query: z.string().describe("The search query, phrased as you would type it into Google."),
    }),
    handler: async ({ query }, context) => {
      if (context?.signal?.aborted) {
        const err: any = new Error("Web search cancelled by signal")
        err.code = "CANCELLED"
        throw err
      }
      return webSearch(query)
    },
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredEnv: ["TAVILY_API_KEY", "SERPER_API_KEY"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => {
        const hasTavily = Boolean(process.env.TAVILY_API_KEY)
        const hasSerper = Boolean(process.env.SERPER_API_KEY)
        return {
          available: hasTavily || hasSerper,
          reason: hasTavily || hasSerper ? undefined : "Neither TAVILY_API_KEY nor SERPER_API_KEY is configured",
        }
      },
    },
    routing: {
      keywords: ["web search", "google", "search online", "look up", "current events", "latest version", "docs"],
      domainHints: ["Web research"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("research.fetch"),
    legacyToolName: "fetchPage",
    domain: "research",
    title: "Fetch Web Page",
    description:
      "Fetch the main readable content of a web page as markdown, given an absolute URL (e.g. one returned by webSearch). Use to read an article or docs page before answering.",
    inputSchema: z.object({
      url: z.string().describe("The absolute URL to fetch, including https://."),
    }),
    handler: async ({ url }, context) => {
      if (context?.signal?.aborted) {
        const err: any = new Error("Fetch page cancelled by signal")
        err.code = "CANCELLED"
        throw err
      }
      return fetchPage(url)
    },
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredEnv: ["FIRECRAWL_API_KEY"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(process.env.FIRECRAWL_API_KEY),
        reason: process.env.FIRECRAWL_API_KEY ? undefined : "FIRECRAWL_API_KEY is not configured",
      }),
    },
    routing: {
      keywords: ["fetch page", "read url", "scrape page", "read article", "visit website"],
      domainHints: ["Web research"],
      promptVisibility: true,
    },
    userFacing: true,
  },
]

export const RESEARCH_CAPABILITIES: ReadonlyArray<CapabilityDefinition> = researchCapabilities
