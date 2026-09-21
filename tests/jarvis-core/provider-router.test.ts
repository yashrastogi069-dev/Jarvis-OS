import { describe, it, expect, beforeEach } from "vitest"
import { z } from "zod"
import {
  TurnDeadline,
  MockModelAdapter,
  ProviderRoleRouter,
} from "../../lib/jarvis-core/providers"

describe("JARVIS CORE V2 — C14: Provider-Role Router & Global Deadline Model", () => {
  describe("TurnDeadline Dual-Threshold Model", () => {
    it("initializes correct hard and soft deadlines", () => {
      const start = 1000
      const deadline = new TurnDeadline(60_000, 5_000, start)
      expect(deadline.budgetMs).toBe(60_000)
      expect(deadline.softBufferMs).toBe(5_000)
      expect(deadline.hardDeadline).toBe(61_000)
      expect(deadline.softDeadline).toBe(56_000)
    })

    it("throws if budgetMs <= 0 or softBufferMs >= budgetMs", () => {
      expect(() => new TurnDeadline(0)).toThrow("budgetMs must be greater than 0")
      expect(() => new TurnDeadline(5000, 5000)).toThrow("must be non-negative and less than budgetMs")
      expect(() => new TurnDeadline(5000, -10)).toThrow("must be non-negative")
    })

    it("tracks elapsed time, remaining time, and checkpoints", async () => {
      const deadline = new TurnDeadline(500, 100)
      expect(deadline.isExpired()).toBe(false)
      expect(deadline.isSoftExpired()).toBe(false)
      expect(deadline.remainingMs()).toBeGreaterThan(0)
      expect(deadline.remainingSoftMs()).toBeGreaterThan(0)

      const cp = deadline.checkpoint("init")
      expect(cp.stageName).toBe("init")
      expect(cp.isExpired).toBe(false)
    })

    it("triggers assertNotExpired() when hard deadline is exceeded", () => {
      // Create a deadline that started in the past
      const pastStart = Date.now() - 2000
      const deadline = new TurnDeadline(1000, 200, pastStart)

      expect(deadline.isExpired()).toBe(true)
      expect(deadline.isSoftExpired()).toBe(true)
      expect(deadline.remainingMs()).toBe(0)

      expect(() => deadline.assertNotExpired("execution_step")).toThrowError(
        /Global turn deadline of 1000ms exceeded during \[execution_step\]/
      )
    })

    it("propagates parent abort signal to child signal", () => {
      const deadline = new TurnDeadline(10_000, 2_000)
      const parentController = new AbortController()
      const childSignal = deadline.createChildSignal(parentController.signal)

      expect(childSignal.aborted).toBe(false)
      parentController.abort("User cancelled turn")
      expect(childSignal.aborted).toBe(true)
    })

    it("auto-aborts child signal when hard deadline expires", async () => {
      const deadline = new TurnDeadline(50, 10)
      const childSignal = deadline.createChildSignal()

      expect(childSignal.aborted).toBe(false)
      await new Promise((r) => setTimeout(r, 70))
      expect(childSignal.aborted).toBe(true)
    })

    it("enforces single global deadline across sequential pipeline stages", async () => {
      // Total turn budget: 150ms
      const deadline = new TurnDeadline(150, 30)

      // Stage 1: Classifier (runs 20ms)
      await new Promise((r) => setTimeout(r, 20))
      deadline.assertNotExpired("classifier")
      const cp1 = deadline.checkpoint("classifier")
      expect(cp1.elapsedMs).toBeGreaterThanOrEqual(15)

      // Stage 2: Planning (runs 30ms)
      await new Promise((r) => setTimeout(r, 30))
      deadline.assertNotExpired("planner")
      const cp2 = deadline.checkpoint("planner")
      expect(cp2.elapsedMs).toBeGreaterThan(cp1.elapsedMs)

      // Stage 3: Execution (simulate long delay that exceeds remaining)
      await new Promise((r) => setTimeout(r, 110))
      expect(deadline.isExpired()).toBe(true)
      expect(() => deadline.assertNotExpired("step_executor")).toThrow("exceeded during [step_executor]")
    })
  })

  describe("ProviderRoleRouter & Mock Adapters", () => {
    let router: ProviderRoleRouter
    let fastMock: MockModelAdapter
    let smartMock: MockModelAdapter
    let fallbackMock: MockModelAdapter

    beforeEach(() => {
      router = new ProviderRoleRouter({
        defaultCooldownMs: 500, // short cooldown for testing
        maxConsecutiveErrorsBeforeCooldown: 2,
      })

      fastMock = new MockModelAdapter("fast-provider", "Fast Model Provider")
      smartMock = new MockModelAdapter("smart-provider", "Smart Reasoning Provider")
      fallbackMock = new MockModelAdapter("fallback-provider", "Reliable Fallback Provider")

      router.registerAdapter(fastMock)
      router.registerAdapter(smartMock)
      router.registerAdapter(fallbackMock)

      // Role configs
      router.configureRole({
        role: "CHAT",
        primaryProvider: "fast-provider",
        primaryModel: "fast-gpt",
        fallbackProvider: "fallback-provider",
        fallbackModel: "fallback-mini",
      })

      router.configureRole({
        role: "PLANNER",
        primaryProvider: "smart-provider",
        primaryModel: "reasoner-pro",
        fallbackProvider: "fallback-provider",
        fallbackModel: "fallback-pro",
      })
    })

    it("registers adapters and queries health status", () => {
      expect(router.getRegisteredAdapters().length).toBe(3)
      expect(router.getProviderHealth("fast-provider")).toBe("HEALTHY")
      expect(router.getProviderHealth("smart-provider")).toBe("HEALTHY")

      fastMock.setAvailable(false)
      expect(router.getProviderHealth("fast-provider")).toBe("OFFLINE")
    })

    it("routes CHAT to primary provider when healthy", async () => {
      fastMock.enqueueResponse("Hello from fast provider!")

      const response = await router.generateText("CHAT", "Hello Jarvis")
      expect(response.text).toBe("Hello from fast provider!")
      expect(response.providerId).toBe("fast-provider")
      expect(response.model).toBe("fast-gpt")

      const metrics = router.getProviderMetrics("fast-provider")
      expect(metrics.successfulRequests).toBe(1)
      expect(metrics.failedRequests).toBe(0)
    })

    it("automatically fails over to fallback provider on primary failure", async () => {
      // Set primary to trigger error
      fastMock.triggerError(new Error("503 Service Unavailable"), 1)
      fallbackMock.enqueueResponse("Response from fallback provider")

      const response = await router.generateText("CHAT", "Need fast answer")
      expect(response.text).toBe("Response from fallback provider")
      expect(response.providerId).toBe("fallback-provider")
      expect(response.model).toBe("fallback-mini")

      const primaryMetrics = router.getProviderMetrics("fast-provider")
      expect(primaryMetrics.failedRequests).toBe(1)

      const fallbackMetrics = router.getProviderMetrics("fallback-provider")
      expect(fallbackMetrics.successfulRequests).toBe(1)
    })

    it("places provider into COOLDOWN after consecutive errors or rate limit", async () => {
      // 429 rate limit triggers immediate cooldown
      fastMock.triggerError(new Error("429 Too Many Requests - quota exceeded"), 5)
      fallbackMock.enqueueResponse("Fallback to the rescue")

      const res1 = await router.generateText("CHAT", "Query 1")
      expect(res1.providerId).toBe("fallback-provider")

      // fast-provider should now be in COOLDOWN
      expect(router.getProviderHealth("fast-provider")).toBe("COOLDOWN")

      // Next request routes directly to fallback without touching primary
      fastMock.clearCallHistory()
      fallbackMock.enqueueResponse("Fallback handled second request")

      const res2 = await router.generateText("CHAT", "Query 2")
      expect(res2.providerId).toBe("fallback-provider")
      expect(fastMock.getCallHistory().length).toBe(0) // Primary wasn't even called!
    })

    it("recovers from COOLDOWN after cooldown window expires or is cleared", async () => {
      router.setCooldown("fast-provider", 50) // 50ms cooldown
      expect(router.getProviderHealth("fast-provider")).toBe("COOLDOWN")

      await new Promise((r) => setTimeout(r, 60))
      expect(router.getProviderHealth("fast-provider")).toBe("HEALTHY")

      fastMock.enqueueResponse("I am back online!")
      const res = await router.generateText("CHAT", "Are you back?")
      expect(res.text).toBe("I am back online!")
      expect(res.providerId).toBe("fast-provider")
    })

    it("generates structured objects with Zod schema validation", async () => {
      const PlanSchema = z.object({
        goal: z.string(),
        stepCount: z.number(),
      })

      smartMock.enqueueObject({
        goal: "Deploy release",
        stepCount: 3,
      })

      const result = await router.generateObject("PLANNER", "Plan deployment", PlanSchema)
      expect(result.object.goal).toBe("Deploy release")
      expect(result.object.stepCount).toBe(3)
      expect(result.response.providerId).toBe("smart-provider")
    })

    it("fails gracefully and triggers fallback if object schema validation fails on primary", async () => {
      const OutputSchema = z.object({
        validKey: z.string(),
      })

      // Primary gives invalid object missing validKey
      smartMock.enqueueObject({ invalidKey: 123 })
      // Fallback gives valid object
      fallbackMock.enqueueObject({ validKey: "corrected" })

      const result = await router.generateObject("PLANNER", "Extract", OutputSchema)
      expect(result.object.validKey).toBe("corrected")
      expect(result.response.providerId).toBe("fallback-provider")
    })

    it("respects TurnDeadline when routing calls", async () => {
      const deadline = new TurnDeadline(50, 10)
      // Wait for deadline to expire
      await new Promise((r) => setTimeout(r, 60))

      await expect(
        router.generateText("CHAT", "Should fail due to deadline", { deadline })
      ).rejects.toThrow("Global turn deadline of 50ms exceeded")
    })

    it("throws clear error if both primary and fallback fail", async () => {
      smartMock.triggerError(new Error("Smart provider down"))
      fallbackMock.triggerError(new Error("Fallback also down"))

      await expect(
        router.generateText("PLANNER", "Impossible request")
      ).rejects.toThrow("Fallback also down")

      expect(router.getProviderMetrics("smart-provider").failedRequests).toBe(1)
      expect(router.getProviderMetrics("fallback-provider").failedRequests).toBe(1)
    })
  })
})
