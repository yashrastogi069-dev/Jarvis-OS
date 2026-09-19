/**
 * JARVIS CORE V2 — SAFE CAPABILITY RESULT BOUNDARY TESTS
 * 
 * Checkpoint: C3 (Milestone 0)
 * Status: Authoritative Test Suite
 * 
 * Verification Dimensions:
 * 1. Result Contract & Discriminated Union: Success vs Failure schema & metadata.
 * 2. Error Taxonomy: All 14 CapabilityErrorCode values with context-sensitive RetryHint.
 * 3. Schema Validation: Malformed input caught before handler, mapped to INVALID_INPUT.
 * 4. Cancellation: AbortSignal cancellation caught and mapped to CANCELLED.
 * 5. Deterministic JSON Normalization: Date, BigInt, NaN, circular graph rejection, Error rejection.
 * 6. Secret Redaction: Bearer tokens, GitHub PATs, Google keys, Slack/Telegram tokens, passwords.
 * 7. Mutation Uncertainty (UNKNOWN_COMMIT): External mutation timeouts map to UNKNOWN_COMMIT with REQUIRES_POLICY.
 * 8. Legacy Error Normalization: Handlers returning { error: string } converted to CapabilityFailure.
 * 9. Real Domain Failure Conversions: tasks.complete(999999) -> NOT_FOUND, duplicate wake word -> ALREADY_EXISTS.
 * 10. All 47 Registered Capabilities Execution: None throw uncaught exceptions.
 * 11. AI SDK Tool Adapter: Returns structured error objects instead of throwing.
 * 12. Performance Overhead Benchmark: Boundary overhead is under 1ms per execution.
 * 13. Framework Independence: Zero React, Next.js, or ToolLoopAgent imports in core.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import { asCapabilityId, asTraceId } from "@/lib/jarvis-core/types"
import {
  capabilityRegistry,
  executeSafely,
  executeCapabilitySafely,
  normalizeError,
  sanitizeSecrets,
  toJsonValue,
  CapabilityOperationalError,
  type CapabilityResult,
  type CapabilityErrorCode,
  type RetryHint,
  type CapabilityDefinition,
} from "@/lib/jarvis-core/capabilities/registry"

describe("JARVIS CORE V2 — Structured Capability Result Boundary (C3)", () => {
  // ==========================================================================
  // 1. RESULT CONTRACT & DISCRIMINATED UNION
  // ==========================================================================
  describe("Result Contract & Discriminated Union", () => {
    it("returns CapabilitySuccess on successful execution with metadata", async () => {
      const dummyCap: CapabilityDefinition = {
        id: asCapabilityId("test.success"),
        legacyToolName: "testSuccess",
        domain: "system",
        title: "Test Success",
        description: "Test capability",
        inputSchema: z.object({ value: z.string() }),
        handler: async ({ value }) => ({ echo: value, count: 42 }),
        actionClass: "READ_ONLY",
        confirmation: { defaultPolicy: "NONE" },
        idempotency: { idempotencyClass: "READ_ONLY" },
        requirements: {},
        availability: { staticState: "ALWAYS" },
        routing: {},
        userFacing: false,
      }

      const res = await executeCapabilitySafely(dummyCap, { value: "hello" })
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data).toEqual({ echo: "hello", count: 42 })
        expect(res.metadata.capabilityId).toBe("test.success")
        expect(res.metadata.traceId).toBeDefined()
        expect(typeof res.metadata.durationMs).toBe("number")
        expect(res.metadata.durationMs).toBeGreaterThanOrEqual(0)
        expect(res.metadata.attempt).toBe(1)
      }
    })

    it("returns CapabilityFailure on thrown exception with structured error and metadata", async () => {
      const dummyCap: CapabilityDefinition = {
        id: asCapabilityId("test.failure"),
        legacyToolName: "testFailure",
        domain: "system",
        title: "Test Failure",
        description: "Test failure capability",
        inputSchema: z.object({}),
        handler: async () => {
          throw new Error("Simulated failure")
        },
        actionClass: "READ_ONLY",
        confirmation: { defaultPolicy: "NONE" },
        idempotency: { idempotencyClass: "READ_ONLY" },
        requirements: {},
        availability: { staticState: "ALWAYS" },
        routing: {},
        userFacing: false,
      }

      const res = await executeCapabilitySafely(dummyCap, {})
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("INTERNAL_ERROR")
        expect(res.error.message).toBe("Simulated failure")
        expect(res.error.retryHint).toBe("DO_NOT_RETRY")
        expect(res.metadata.capabilityId).toBe("test.failure")
        expect(res.metadata.attempt).toBe(1)
      }
    })

    it("returns NOT_FOUND failure when capability ID does not exist in registry", async () => {
      const res = await executeSafely("nonexistent.capability.id", {})
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("NOT_FOUND")
        expect(res.error.message).toContain("nonexistent.capability.id")
        expect(res.error.retryHint).toBe("DO_NOT_RETRY")
      }
    })
  })

  // ==========================================================================
  // 2. ERROR TAXONOMY & RETRY HINTS
  // ==========================================================================
  describe("Error Taxonomy & Retry Hints", () => {
    const allTaxonomyCodes: ReadonlyArray<CapabilityErrorCode> = [
      "INVALID_INPUT",
      "UNCONFIGURED",
      "AUTH_REQUIRED",
      "PERMISSION_DENIED",
      "NOT_FOUND",
      "CONFLICT",
      "ALREADY_EXISTS",
      "RATE_LIMITED",
      "TIMEOUT",
      "NETWORK_ERROR",
      "SERVICE_UNAVAILABLE",
      "CANCELLED",
      "UNKNOWN_COMMIT",
      "INTERNAL_ERROR",
    ]

    it("defines and supports all 14 semantic error codes", () => {
      expect(allTaxonomyCodes).toHaveLength(14)
      for (const code of allTaxonomyCodes) {
        const err = new CapabilityOperationalError({ code, message: `Error for ${code}` })
        const normalized = normalizeError(err)
        expect(normalized.code).toBe(code)
      }
    })

    it("assigns SAFE_TO_RETRY for read-only transient errors (rate limit, timeout, network)", () => {
      const rateLimitErr = normalizeError({ status: 429, message: "Too Many Requests" }, "READ_ONLY")
      expect(rateLimitErr.code).toBe("RATE_LIMITED")
      expect(rateLimitErr.retryHint).toBe("SAFE_TO_RETRY")

      const timeoutErr = normalizeError(new Error("Request timed out"), "READ_ONLY")
      expect(timeoutErr.code).toBe("TIMEOUT")
      expect(timeoutErr.retryHint).toBe("SAFE_TO_RETRY")

      const networkErr = normalizeError(new Error("fetch failed"), "READ_ONLY")
      expect(networkErr.code).toBe("NETWORK_ERROR")
      expect(networkErr.retryHint).toBe("SAFE_TO_RETRY")
    })

    it("assigns DO_NOT_RETRY for deterministic or credential errors", () => {
      const unconfigured = normalizeError(new Error("GITHUB_TOKEN is not set"), "EXTERNAL_CREATE")
      expect(unconfigured.code).toBe("UNCONFIGURED")
      expect(unconfigured.retryHint).toBe("DO_NOT_RETRY")

      const authErr = normalizeError({ status: 401, message: "Unauthorized" }, "READ_ONLY")
      expect(authErr.code).toBe("AUTH_REQUIRED")
      expect(authErr.retryHint).toBe("DO_NOT_RETRY")

      const permErr = normalizeError({ status: 403, message: "Forbidden" }, "READ_ONLY")
      expect(permErr.code).toBe("PERMISSION_DENIED")
      expect(permErr.retryHint).toBe("DO_NOT_RETRY")

      const notFoundErr = normalizeError({ status: 404, message: "Not found" }, "READ_ONLY")
      expect(notFoundErr.code).toBe("NOT_FOUND")
      expect(notFoundErr.retryHint).toBe("DO_NOT_RETRY")
    })
  })

  // ==========================================================================
  // 3. MUTATION UNCERTAINTY (UNKNOWN_COMMIT)
  // ==========================================================================
  describe("Mutation Uncertainty & External Side Effects", () => {
    it("maps timeout during EXTERNAL_SEND to UNKNOWN_COMMIT with REQUIRES_POLICY", () => {
      const err = normalizeError(new Error("Operation timed out"), "EXTERNAL_SEND")
      expect(err.code).toBe("UNKNOWN_COMMIT")
      expect(err.retryHint).toBe("REQUIRES_POLICY")
      expect(err.message).toContain("unverified")
    })

    it("maps network failure during EXTERNAL_CREATE to UNKNOWN_COMMIT with REQUIRES_POLICY", () => {
      const err = normalizeError(new Error("fetch failed: ECONNRESET"), "EXTERNAL_CREATE")
      expect(err.code).toBe("UNKNOWN_COMMIT")
      expect(err.retryHint).toBe("REQUIRES_POLICY")
      expect(err.message).toContain("unverified")
    })

    it("maps HTTP 500 during EXTERNAL_UPDATE to UNKNOWN_COMMIT with REQUIRES_POLICY", () => {
      const err = normalizeError({ status: 500, message: "Internal Server Error" }, "EXTERNAL_UPDATE")
      expect(err.code).toBe("UNKNOWN_COMMIT")
      expect(err.retryHint).toBe("REQUIRES_POLICY")
    })

    it("never assigns SAFE_TO_RETRY to UNKNOWN_COMMIT failures", () => {
      const err = normalizeError(new Error("Timeout during send"), "EXTERNAL_SEND")
      expect(err.retryHint).not.toBe("SAFE_TO_RETRY")
      expect(err.retryHint).toBe("REQUIRES_POLICY")
    })
  })

  // ==========================================================================
  // 4. SCHEMA VALIDATION BOUNDARY
  // ==========================================================================
  describe("Schema Validation Boundary", () => {
    const strictCap: CapabilityDefinition = {
      id: asCapabilityId("test.schema"),
      legacyToolName: "testSchema",
      domain: "system",
      title: "Test Schema",
      description: "Test schema validation",
      inputSchema: z.object({
        requiredField: z.string().min(3),
        count: z.number().int().positive(),
      }),
      handler: async (input) => input,
      actionClass: "READ_ONLY",
      confirmation: { defaultPolicy: "NONE" },
      idempotency: { idempotencyClass: "READ_ONLY" },
      requirements: {},
      availability: { staticState: "ALWAYS" },
      routing: {},
      userFacing: false,
    }

    it("catches missing required fields and returns INVALID_INPUT without invoking handler", async () => {
      const res = await executeCapabilitySafely(strictCap, {})
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("INVALID_INPUT")
        expect(res.error.retryHint).toBe("DO_NOT_RETRY")
        expect(res.error.message).toContain("requiredField")
        expect(res.error.details).toBeDefined()
      }
    })

    it("catches type mismatch errors and returns INVALID_INPUT", async () => {
      const res = await executeCapabilitySafely(strictCap, { requiredField: "ab", count: -5 })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("INVALID_INPUT")
        expect(res.error.message).toContain("Input validation failed")
      }
    })

    it("executes handler successfully when input matches schema", async () => {
      const res = await executeCapabilitySafely(strictCap, { requiredField: "validString", count: 10 })
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data).toEqual({ requiredField: "validString", count: 10 })
      }
    })
  })

  // ==========================================================================
  // 5. CANCELLATION SUPPORT
  // ==========================================================================
  describe("Cancellation Support", () => {
    it("returns CANCELLED failure if signal is already aborted before invocation", async () => {
      const dummyCap: CapabilityDefinition = {
        id: asCapabilityId("test.cancel"),
        legacyToolName: "testCancel",
        domain: "system",
        title: "Test Cancel",
        description: "Test cancellation",
        inputSchema: z.object({}),
        handler: async () => ({ status: "executed" }),
        actionClass: "READ_ONLY",
        confirmation: { defaultPolicy: "NONE" },
        idempotency: { idempotencyClass: "READ_ONLY" },
        requirements: {},
        availability: { staticState: "ALWAYS" },
        routing: {},
        userFacing: false,
      }

      const controller = new AbortController()
      controller.abort()

      const res = await executeCapabilitySafely(dummyCap, {}, { signal: controller.signal })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("CANCELLED")
        expect(res.error.retryHint).toBe("DO_NOT_RETRY")
      }
    })
  })

  // ==========================================================================
  // 6. DETERMINISTIC JSON SERIALIZATION (toJsonValue)
  // ==========================================================================
  describe("Deterministic JSON Serialization (toJsonValue)", () => {
    it("converts BigInt to string", () => {
      const output = toJsonValue({ id: 1234567890123456789n })
      expect(output).toEqual({ id: "1234567890123456789" })
    })

    it("converts Date to ISO string", () => {
      const date = new Date("2026-09-19T12:00:00.000Z")
      const output = toJsonValue({ timestamp: date })
      expect(output).toEqual({ timestamp: "2026-09-19T12:00:00.000Z" })
    })

    it("converts NaN and Infinity to null", () => {
      const output = toJsonValue({ notANumber: NaN, inf: Infinity, negInf: -Infinity })
      expect(output).toEqual({ notANumber: null, inf: null, negInf: null })
    })

    it("omits undefined properties from serialized objects", () => {
      const output = toJsonValue({ a: 1, b: undefined, c: "test" })
      expect(output).toEqual({ a: 1, c: "test" })
      expect("b" in (output as object)).toBe(false)
    })

    it("throws INTERNAL_ERROR when a circular reference is encountered", () => {
      const circular: any = { name: "loop" }
      circular.self = circular

      expect(() => toJsonValue(circular)).toThrowError(CapabilityOperationalError)
      try {
        toJsonValue(circular)
      } catch (err: any) {
        expect(err.code).toBe("INTERNAL_ERROR")
        expect(err.message).toContain("Circular reference")
      }
    })

    it("throws INTERNAL_ERROR when raw Error or function is in data payload", () => {
      expect(() => toJsonValue({ err: new Error("raw error") })).toThrowError(CapabilityOperationalError)
      expect(() => toJsonValue({ fn: () => {} })).toThrowError(CapabilityOperationalError)
    })

    it("safe boundary intercepts circular references and returns structured INTERNAL_ERROR failure", async () => {
      const circularCap: CapabilityDefinition = {
        id: asCapabilityId("test.circular"),
        legacyToolName: "testCircular",
        domain: "system",
        title: "Test Circular",
        description: "Test circular structure handling",
        inputSchema: z.object({}),
        handler: async () => {
          const obj: any = { status: "loop" }
          obj.ref = obj
          return obj
        },
        actionClass: "READ_ONLY",
        confirmation: { defaultPolicy: "NONE" },
        idempotency: { idempotencyClass: "READ_ONLY" },
        requirements: {},
        availability: { staticState: "ALWAYS" },
        routing: {},
        userFacing: false,
      }

      const res = await executeCapabilitySafely(circularCap, {})
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("INTERNAL_ERROR")
        expect(res.error.message).toContain("Circular reference")
      }
    })
  })

  // ==========================================================================
  // 7. SECRET REDACTION (sanitizeSecrets)
  // ==========================================================================
  describe("Secret Redaction (sanitizeSecrets)", () => {
    it("redacts Bearer tokens in error messages and headers", () => {
      const raw = "Failed request: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
      const clean = sanitizeSecrets(raw)
      expect(clean).toContain("Authorization: Bearer [REDACTED]")
      expect(clean).not.toContain("eyJhbGciOi")
    })

    it("redacts GitHub PAT tokens", () => {
      const raw = "Failed with token ghp_A1b2C3d4E5f6G7h8I9j0K1L2M3N4O5P6Q7R8"
      const clean = sanitizeSecrets(raw)
      expect(clean).toContain("[REDACTED_GITHUB_TOKEN]")
      expect(clean).not.toContain("ghp_A1b2C3d4")
    })

    it("redacts Google API keys", () => {
      const raw = "Request rejected for key AIzaSyD9-TestApiKeyGoogleSecret12345"
      const clean = sanitizeSecrets(raw)
      expect(clean).toContain("[REDACTED_GOOGLE_KEY]")
      expect(clean).not.toContain("AIzaSyD9-Test")
    })

    it("redacts Slack tokens", () => {
      const raw = "Slack API error with xoxb-123456789-987654321-abcdef"
      const clean = sanitizeSecrets(raw)
      expect(clean).toContain("[REDACTED_SLACK_TOKEN]")
      expect(clean).not.toContain("xoxb-123456")
    })

    it("redacts Telegram bot tokens", () => {
      const raw = "Telegram connection to bot123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567 failed"
      const clean = sanitizeSecrets(raw)
      expect(clean).toContain("[REDACTED_TELEGRAM_TOKEN]")
      expect(clean).not.toContain("bot123456789:ABC")
    })

    it("redacts key=value and password=value parameter pairs", () => {
      const raw = "Connection failed: password=supersecretpass123&api_key=myPrivateSecretKey"
      const clean = sanitizeSecrets(raw)
      expect(clean).toContain("password=[REDACTED]")
      expect(clean).toContain("api_key=[REDACTED]")
      expect(clean).not.toContain("supersecretpass123")
      expect(clean).not.toContain("myPrivateSecretKey")
    })
  })

  // ==========================================================================
  // 8. LEGACY ERROR OBJECT NORMALIZATION
  // ==========================================================================
  describe("Legacy Error Object Normalization", () => {
    it("normalizes { error: string } returned by legacy tools into CapabilityFailure", async () => {
      const legacyErrorCap: CapabilityDefinition = {
        id: asCapabilityId("test.legacyError"),
        legacyToolName: "testLegacyError",
        domain: "research",
        title: "Test Legacy Error",
        description: "Test legacy error return",
        inputSchema: z.object({ query: z.string() }),
        handler: async () => ({ error: "web search unavailable: Tavily API rate limit exceeded (status 429)" }),
        actionClass: "READ_ONLY",
        confirmation: { defaultPolicy: "NONE" },
        idempotency: { idempotencyClass: "READ_ONLY" },
        requirements: {},
        availability: { staticState: "ALWAYS" },
        routing: {},
        userFacing: false,
      }

      const res = await executeCapabilitySafely(legacyErrorCap, { query: "test" })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("RATE_LIMITED")
        expect(res.error.retryHint).toBe("SAFE_TO_RETRY")
      }
    })
  })

  // ==========================================================================
  // 9. REAL DOMAIN FAILURE CONVERSIONS
  // ==========================================================================
  describe("Real Domain Failure Conversions", () => {
    it("converts non-existent task completion to NOT_FOUND", async () => {
      const res = await executeSafely("tasks.complete", { id: 99999999 })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("NOT_FOUND")
        expect(res.error.retryHint).toBe("DO_NOT_RETRY")
        expect(res.error.message).toContain("not found")
      }
    })

    it("converts unconfigured GitHub capability to UNCONFIGURED with clean fixAction", async () => {
      // In test environment without GITHUB_TOKEN set
      const orig = process.env.GITHUB_TOKEN
      delete process.env.GITHUB_TOKEN
      try {
        const res = await executeSafely("github.notifications.list", {})
        expect(res.success).toBe(false)
        if (!res.success) {
          expect(res.error.code).toBe("UNCONFIGURED")
          expect(res.error.retryHint).toBe("DO_NOT_RETRY")
          expect(res.error.fixAction).toBeDefined()
        }
      } finally {
        if (orig) process.env.GITHUB_TOKEN = orig
      }
    })

    it("converts unconfigured Obsidian capability to UNCONFIGURED", async () => {
      const res = await executeSafely("obsidian.note.read", { path: "nonexistent.md" })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("UNCONFIGURED")
        expect(res.error.retryHint).toBe("DO_NOT_RETRY")
      }
    })
  })

  // ==========================================================================
  // 10. ALL 47 REGISTERED CAPABILITIES SAFE INVOCATION
  // ==========================================================================
  describe("All 47 Registered Capabilities Safe Invocation", () => {
    it(
      "safely invokes all 47 registered capabilities without throwing uncaught exceptions",
      async () => {
        const all = capabilityRegistry.getAll()
        expect(all).toHaveLength(47)

        for (const cap of all) {
          // Execute through safe boundary with empty input
          // Either succeeds or returns a typed CapabilityFailure with metadata. It must NEVER throw!
          let threw = false
          let result: CapabilityResult | undefined
          try {
            result = await executeCapabilitySafely(cap, {})
          } catch {
            threw = true
          }

          expect(threw).toBe(false)
          expect(result).toBeDefined()
          expect(typeof result!.success).toBe("boolean")
          expect(result!.metadata).toBeDefined()
          expect(result!.metadata.capabilityId).toBe(cap.id)
          expect(result!.metadata.traceId).toBeDefined()
          expect(typeof result!.metadata.durationMs).toBe("number")

          if (!result!.success) {
            expect(result!.error).toBeDefined()
            expect(typeof result!.error.code).toBe("string")
            expect(typeof result!.error.message).toBe("string")
            expect(["DO_NOT_RETRY", "SAFE_TO_RETRY", "REQUIRES_POLICY"]).toContain(result!.error.retryHint)
          }
        }
      },
      30_000,
    )
  })

  // ==========================================================================
  // 11. AI SDK TOOL ADAPTER INTEGRATION
  // ==========================================================================
  describe("AI SDK Tool Adapter Integration", () => {
    it("wraps capabilities into AI SDK tools that return structured error payloads instead of throwing", async () => {
      const failingCap: CapabilityDefinition = {
        id: asCapabilityId("test.aisdk"),
        legacyToolName: "testAiSdk",
        domain: "system",
        title: "Test AI SDK Tool",
        description: "Test AI SDK tool execution",
        inputSchema: z.object({ value: z.string() }),
        handler: async () => {
          throw new Error("Task not found with ID 42")
        },
        actionClass: "READ_ONLY",
        confirmation: { defaultPolicy: "NONE" },
        idempotency: { idempotencyClass: "READ_ONLY" },
        requirements: {},
        availability: { staticState: "ALWAYS" },
        routing: {},
        userFacing: true,
      }

      const aiTool = capabilityRegistry.toAiSdkTool(failingCap)
      expect(aiTool).toBeDefined()
      expect(aiTool.description).toBe("Test AI SDK tool execution")

      // Execute through AI SDK execute method
      let threw = false
      let output: any
      try {
        output = await (aiTool as any).execute({ value: "test" }, { toolCallId: "tc_1", messages: [] })
      } catch {
        threw = true
      }

      // Invariant: AI SDK tool execution MUST NOT throw into the agent loop
      expect(threw).toBe(false)
      expect(output).toBeDefined()
      expect(output.error).toContain("not found")
      expect(output.code).toBe("NOT_FOUND")
      expect(output.retryHint).toBe("DO_NOT_RETRY")
    })
  })

  // ==========================================================================
  // 12. PERFORMANCE OVERHEAD BENCHMARK
  // ==========================================================================
  describe("Performance Overhead Benchmark", () => {
    it("executes boundary with less than 1ms average overhead", async () => {
      const fastCap: CapabilityDefinition = {
        id: asCapabilityId("test.fast"),
        legacyToolName: "testFast",
        domain: "system",
        title: "Fast Capability",
        description: "In-memory benchmark capability",
        inputSchema: z.object({ x: z.number() }),
        handler: async ({ x }) => ({ result: x * 2 }),
        actionClass: "READ_ONLY",
        confirmation: { defaultPolicy: "NONE" },
        idempotency: { idempotencyClass: "READ_ONLY" },
        requirements: {},
        availability: { staticState: "ALWAYS" },
        routing: {},
        userFacing: false,
      }

      // Warm up
      for (let i = 0; i < 10; i++) {
        await executeCapabilitySafely(fastCap, { x: i })
      }

      // Benchmark 100 iterations
      const iterations = 100
      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        await executeCapabilitySafely(fastCap, { x: i })
      }
      const totalTime = performance.now() - start
      const avgMs = totalTime / iterations

      // Verify that boundary overhead is sub-millisecond per invocation
      expect(avgMs).toBeLessThan(1.0)
    })
  })

  // ==========================================================================
  // 13. FRAMEWORK INDEPENDENCE & ARCHITECTURAL INVARIANTS
  // ==========================================================================
  describe("Framework Independence & Architectural Invariants", () => {
    const coreFiles = [
      "lib/jarvis-core/capabilities/result.ts",
      "lib/jarvis-core/capabilities/json.ts",
      "lib/jarvis-core/capabilities/normalizer.ts",
      "lib/jarvis-core/capabilities/safe-boundary.ts",
      "lib/jarvis-core/capabilities/registry.ts",
    ]

    for (const relPath of coreFiles) {
      it(`verifies ${relPath} contains zero React, Next.js, or ToolLoopAgent imports`, () => {
        const fullPath = path.resolve(process.cwd(), relPath)
        const content = fs.readFileSync(fullPath, "utf-8")

        expect(content).not.toMatch(/from\s+["']react["']/)
        expect(content).not.toMatch(/from\s+["']next/)
        expect(content).not.toMatch(/import\s+.*ToolLoopAgent/)
        expect(content).not.toMatch(/from\s+["'][^"']*ToolLoopAgent/)
      })
    }
  })
})
