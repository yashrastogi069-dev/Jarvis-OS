/**
 * JARVIS CORE V2 — REAL MODEL ADAPTER UNIT & SMOKE TEST
 * 
 * Checkpoint: Pre-Migration Gate B
 * Verifies that real provider adapters properly bridge lib/providers.ts into Core V2
 * ProviderRoleRouter without mutating existing provider logic.
 */

import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  createRealProviderAdapters,
  createRealProviderRoleRouter,
  RealAiSdkModelAdapter,
} from "../../lib/jarvis-core/providers/real-adapter"
import { ProviderRoleRouter } from "../../lib/jarvis-core/providers/router"

describe("JARVIS CORE V2 — Real Provider Adapter Readiness (Gate B)", () => {
  it("creates real provider adapters for all supported models in lib/providers.ts", () => {
    const adapters = createRealProviderAdapters()
    expect(adapters.length).toBeGreaterThanOrEqual(5)

    const providerIds = adapters.map((a) => a.providerId)
    expect(providerIds).toContain("gemini")
    expect(providerIds).toContain("groq")
    expect(providerIds).toContain("openrouter")
    expect(providerIds).toContain("nvidia")
    expect(providerIds).toContain("ollama")

    for (const adapter of adapters) {
      expect(typeof adapter.providerId).toBe("string")
      expect(typeof adapter.displayName).toBe("string")
      expect(typeof adapter.isAvailable).toBe("function")
      expect(typeof adapter.generateText).toBe("function")
      expect(typeof adapter.generateObject).toBe("function")
    }
  })

  it("registers real adapters into ProviderRoleRouter and configures all 5 required roles", () => {
    const router = createRealProviderRoleRouter()
    expect(router).toBeInstanceOf(ProviderRoleRouter)

    // Verify all 5 roles can resolve an adapter without throwing unconfigured error
    const roles = ["CHAT", "ACTION_RESOLVER", "PLANNER", "REPLANNER", "FINALIZER"] as const
    for (const role of roles) {
      const adapter = router.resolveForRole(role)
      expect(adapter).toBeDefined()
      expect(typeof adapter.providerId).toBe("string")
    }
  })

  it("preserves offline determinism by reporting availability strictly based on key checks", () => {
    const fakeKeyChecker = () => false
    const fakeModelCreator = () => ({}) as any

    const adapter = new RealAiSdkModelAdapter("test-provider", "Test Provider", fakeModelCreator, fakeKeyChecker)
    expect(adapter.isAvailable()).toBe(false)

    const healthyKeyChecker = () => true
    const healthyAdapter = new RealAiSdkModelAdapter("test-provider-2", "Test 2", fakeModelCreator, healthyKeyChecker)
    expect(healthyAdapter.isAvailable()).toBe(true)
  })

  // Opt-in live smoke test when credentials are local
  it("executes opt-in live smoke test if JARVIS_LIVE_PROVIDER_TESTS=1", async () => {
    if (process.env.JARVIS_LIVE_PROVIDER_TESTS !== "1") {
      // In normal CI / offline test runs, this is cleanly skipped
      expect(true).toBe(true)
      return
    }

    const router = createRealProviderRoleRouter()
    const chatAdapter = router.resolveForRole("CHAT")

    if (!chatAdapter.isAvailable()) {
      console.log(`[Gate B Smoke] SKIPPED: Primary provider ${chatAdapter.providerId} has no API credentials.`)
      return
    }

    const start = Date.now()
    const res = await router.generateText("CHAT", "Reply with 'PONG'")
    const duration = Date.now() - start
    expect(res.text).toBeDefined()
    console.log(`[Gate B Smoke] Provider: ${res.providerId}, Model: ${res.model}, Latency: ${duration}ms, Text: ${res.text.trim()}`)
  }, 15000)
})
