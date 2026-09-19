/**
 * JARVIS CORE V2 — CAPABILITY ROUTER TEST SUITE
 * 
 * Checkpoint C7: Validates Strategy E routing classification, tool pruning,
 * fail-open fallback, shadow mode, and benchmarks against routing_corpus_227.json.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  CapabilityRouter,
  capabilityRouter,
  CapabilityRouterEvaluator,
  routerEvaluator,
  classifyStrategyE,
  type RoutingCorpusItem,
} from "../../lib/jarvis-core/routing"

describe("JARVIS CORE V2 — Capability Router & Shadow Evaluation (C7)", () => {
  describe("Corpus Benchmark Evaluation (routing_corpus_227.json)", () => {
    const corpusPath = path.join(process.cwd(), "evals", "corpora", "routing_corpus_227.json")
    const corpus: RoutingCorpusItem[] = JSON.parse(fs.readFileSync(corpusPath, "utf8"))

    it("evaluates 227-item routing corpus and meets >= 99.5% tool recall target", () => {
      const results = routerEvaluator.evaluate(corpus)

      expect(results.totalPrompts).toBe(227)
      expect(results.totalExpectedTools).toBe(195)
      expect(results.totalMatchedTools).toBe(195)

      // Primary architectural requirements
      expect(results.toolRecallPct).toBeGreaterThanOrEqual(99.5)
      expect(results.toolRecallPct).toBe(100.0)
      expect(results.falseExclusionsCount).toBe(0)
      expect(results.targetMet).toBe(true)

      // Heuristic tool budget: <= 12 tools on average
      expect(results.avgToolsExposed).toBeLessThanOrEqual(12.0)
      expect(results.avgToolsExposed).toBeGreaterThan(0)
      expect(results.avgToolsExposed).toBeCloseTo(6.7, 0)

      // Schema token reduction
      expect(results.tokenReductionPct).toBeGreaterThan(80.0)

      // Latency guarantee: sub-millisecond average routing
      expect(results.avgLatencyMs).toBeLessThan(1.0)
    })
  })

  describe("Domain Routing Coverage across all 12 Canonical Domains", () => {
    it("routes Tasks domain requests correctly", () => {
      const decision = capabilityRouter.route("Remind me to buy groceries tomorrow at 5pm")
      expect(decision.domains).toContain("tasks")
      expect(decision.selectedLegacyToolNames).toContain("createTask")
      expect(decision.isFallback).toBe(false)
    })

    it("routes Memory domain requests correctly", () => {
      const decision = capabilityRouter.route("Remember that my daughter is allergic to peanuts")
      expect(decision.domains).toContain("memory")
      expect(decision.selectedLegacyToolNames).toContain("saveMemory")
      expect(decision.isFallback).toBe(false)
    })

    it("routes Skills domain requests correctly", () => {
      const decision = capabilityRouter.route("Automate my evening report workflow into a skill")
      expect(decision.domains).toContain("skills")
      expect(decision.selectedLegacyToolNames).toContain("saveAsSkill")
      expect(decision.isFallback).toBe(false)
    })

    it("routes Wake Words domain requests correctly", () => {
      const decision = capabilityRouter.route("List all spoken trigger words for voice activation")
      expect(decision.domains).toContain("wake_words")
      expect(decision.selectedLegacyToolNames).toContain("listWakeWords")
      expect(decision.isFallback).toBe(false)
    })

    it("routes Preferences domain requests correctly", () => {
      const decision = capabilityRouter.route("Keep your answers brief and concise from now on")
      expect(decision.domains).toContain("preferences")
      expect(decision.selectedLegacyToolNames).toContain("setPreference")
      expect(decision.isFallback).toBe(false)
    })

    it("routes Updates Feed domain requests correctly", () => {
      const decision = capabilityRouter.route("Brief me on what's new and give me the daily feed")
      expect(decision.domains).toContain("feed")
      expect(decision.selectedLegacyToolNames).toContain("getUpdatesFeed")
      expect(decision.isFallback).toBe(false)
    })

    it("routes Web Research domain requests correctly", () => {
      const decision = capabilityRouter.route("Search the web for the latest TypeScript release notes")
      expect(decision.domains).toContain("research")
      expect(decision.selectedLegacyToolNames).toContain("webSearch")
      expect(decision.isFallback).toBe(false)
    })

    it("routes GitHub domain requests correctly", () => {
      const decision = capabilityRouter.route("File a bug report on 'owner/repo' with title 'Broken STT'")
      expect(decision.domains).toContain("github")
      expect(decision.selectedLegacyToolNames).toContain("createGithubIssue")
      expect(decision.isFallback).toBe(false)
    })

    it("routes Google (Gmail & Calendar) domain requests correctly", () => {
      const emailDecision = capabilityRouter.route("Send a reply to message 'msg_456'")
      expect(emailDecision.domains).toContain("google")
      expect(emailDecision.selectedLegacyToolNames).toContain("replyToEmail")

      const calDecision = capabilityRouter.route("Schedule a meeting on my calendar with Sarah")
      expect(calDecision.domains).toContain("google")
      expect(calDecision.selectedLegacyToolNames).toContain("createCalendarEvent")
    })

    it("routes Apple Calendar domain requests correctly", () => {
      const decision = capabilityRouter.route("Search my Apple Calendar for events with 'Doctor'")
      expect(decision.domains).toContain("apple")
      expect(decision.selectedLegacyToolNames).toContain("searchAppleCalendarEvents")
      expect(decision.isFallback).toBe(false)
    })

    it("routes Telegram domain requests correctly", () => {
      const decision = capabilityRouter.route("Send a telegram message to my phone saying hello")
      expect(decision.domains).toContain("telegram")
      expect(decision.selectedLegacyToolNames).toContain("sendTelegram")
      expect(decision.isFallback).toBe(false)
    })

    it("routes Obsidian domain requests correctly", () => {
      const decision = capabilityRouter.route("Search my Obsidian vault notes for 'project alpha'")
      expect(decision.domains).toContain("obsidian")
      expect(decision.selectedLegacyToolNames).toContain("searchNotes")
      expect(decision.isFallback).toBe(false)
    })
  })

  describe("Conversational Chit-Chat Pruning (0 tools exposed)", () => {
    it("prunes pure greetings to 0 tools", () => {
      const decision = capabilityRouter.route("Hello Jarvis, good morning!")
      expect(decision.selectedCapabilities.length).toBe(0)
      expect(decision.selectedLegacyToolNames.length).toBe(0)
      expect(decision.domains.length).toBe(0)
      expect(decision.confidence).toBeGreaterThanOrEqual(0.95)
    })

    it("prunes conceptual questions to 0 tools", () => {
      const decision = capabilityRouter.route("What is the difference between TCP and UDP?")
      expect(decision.selectedCapabilities.length).toBe(0)
      expect(decision.selectedLegacyToolNames.length).toBe(0)
    })

    it("prunes jokes and poems to 0 tools", () => {
      const decision = capabilityRouter.route("Tell me a funny joke about quantum physics")
      expect(decision.selectedCapabilities.length).toBe(0)
      expect(decision.selectedLegacyToolNames.length).toBe(0)
    })
  })

  describe("Multi-Domain & Cross-Domain Capability Routing", () => {
    it("routes multi-domain prompt activating both Research and Obsidian", () => {
      const decision = capabilityRouter.route(
        "Search the web for Next.js 16 features and save the findings into my Obsidian vault note"
      )
      expect(decision.domains).toContain("research")
      expect(decision.domains).toContain("obsidian")
      expect(decision.selectedLegacyToolNames).toContain("webSearch")
      expect(decision.selectedLegacyToolNames).toContain("appendNote")
    })

    it("routes multi-domain prompt activating both Google and Apple Calendar", () => {
      const decision = capabilityRouter.route(
        "Search Gmail for 'flight confirmation' and add the flight to Apple Calendar"
      )
      expect(decision.domains).toContain("google")
      expect(decision.domains).toContain("apple")
      expect(decision.selectedLegacyToolNames).toContain("searchGmail")
      expect(decision.selectedLegacyToolNames).toContain("createAppleCalendarEvent")
    })
  })

  describe("Safe Fail-Open Fallback on Ambiguous or Unrecognized Prompts", () => {
    it("activates CORE_DOMAINS fallback when prompt is ambiguous and has no domain signals", () => {
      const decision = capabilityRouter.route(
        "Please handle this quickly for me",
        { enableFallback: true, fallbackStrategy: "CORE_DOMAINS" }
      )
      expect(decision.isFallback).toBe(true)
      expect(decision.confidence).toBe(0.5)
      expect(decision.domains).toEqual(["tasks", "memory", "research", "feed"])
      expect(decision.selectedLegacyToolNames).toContain("createTask")
      expect(decision.selectedLegacyToolNames).toContain("saveMemory")
      expect(decision.selectedLegacyToolNames).toContain("webSearch")
      expect(decision.selectedLegacyToolNames).toContain("getUpdatesFeed")
    })

    it("activates ALL_CAPABILITIES fallback when configured", () => {
      const decision = capabilityRouter.route(
        "Execute my request immediately",
        { enableFallback: true, fallbackStrategy: "ALL_CAPABILITIES" }
      )
      expect(decision.isFallback).toBe(true)
      expect(decision.selectedCapabilities.length).toBe(47)
      expect(decision.selectedLegacyToolNames.length).toBe(47)
    })
  })

  describe("Shadow Mode & Tool Conversion", () => {
    it("respects shadowMode option without altering return structure", () => {
      const decision = capabilityRouter.route(
        "List all my tasks",
        { shadowMode: true }
      )
      expect(decision.shadowOnly).toBe(true)
      expect(decision.domains).toContain("tasks")
      expect(decision.selectedLegacyToolNames).toContain("listTasks")
    })

    it("returns valid AI SDK tool mapping from getTools()", () => {
      const tools = capabilityRouter.getTools("Add a new task: Walk the dog")
      expect(tools).toHaveProperty("createTask")
      expect(tools).toHaveProperty("listTasks")
      expect(typeof tools["createTask"]).toBe("object")
    })
  })

  describe("Performance & Latency Invariant", () => {
    it("executes routing in under 1ms", () => {
      const t0 = performance.now()
      for (let i = 0; i < 50; i++) {
        capabilityRouter.route("Remind me to check server health at 9am")
      }
      const elapsed = performance.now() - t0
      const perCallMs = elapsed / 50

      expect(perCallMs).toBeLessThan(1.0)
    })
  })
})
