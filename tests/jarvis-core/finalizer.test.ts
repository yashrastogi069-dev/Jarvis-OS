import { describe, it, expect, beforeEach } from "vitest"
import {
  redactSecrets,
  synthesizeDeterministicResponse,
  GroundedFinalizer,
  FinalizationFacts,
} from "../../lib/jarvis-core/finalizer"
import {
  ProviderRoleRouter,
  MockModelAdapter,
  TurnDeadline,
} from "../../lib/jarvis-core/providers"
import { asOperationId, asPlanStepId, asCapabilityId } from "../../lib/jarvis-core/types"
import { asDedupeKey } from "../../lib/jarvis-core/ledger/types"

describe("JARVIS CORE V2 — C15: Grounded Finalizer & Response Generator", () => {
  describe("Secret and Credential Redaction", () => {
    it("redacts OpenAI API keys", () => {
      const text = "Key is sk-12345678901234567890123456789012 and done"
      const result = redactSecrets(text)
      expect(result.sanitizedText).not.toContain("sk-12345678901234567890123456789012")
      expect(result.sanitizedText).toContain("[REDACTED_API_KEY]")
      expect(result.redactedCount).toBe(1)
    })

    it("redacts Bearer tokens", () => {
      const text = "Authorization: Bearer secret_token_xyz_1234567890_abcdef"
      const result = redactSecrets(text)
      expect(result.sanitizedText).toContain("Bearer [REDACTED_BEARER_TOKEN]")
      expect(result.sanitizedText).not.toContain("secret_token_xyz")
      expect(result.redactedCount).toBe(1)
    })

    it("redacts JWT tokens", () => {
      const text = "User session: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
      const result = redactSecrets(text)
      expect(result.sanitizedText).toContain("[REDACTED_JWT_TOKEN]")
      expect(result.redactedCount).toBe(1)
    })

    it("redacts Telegram bot tokens", () => {
      const text = "Sending to bot 1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789"
      const result = redactSecrets(text)
      expect(result.sanitizedText).toContain("[REDACTED_TELEGRAM_TOKEN]")
      expect(result.redactedCount).toBe(1)
    })

    it("redacts passwords embedded in URLs", () => {
      const text = "Connecting to https://admin:superSecretPassword123@api.service.internal/v1"
      const result = redactSecrets(text)
      expect(result.sanitizedText).toContain("https://admin:[REDACTED_PASSWORD]@api.service.internal/v1")
      expect(result.sanitizedText).not.toContain("superSecretPassword123")
      expect(result.redactedCount).toBe(1)
    })
  })

  describe("Deterministic Response Synthesizer", () => {
    it("synthesizes direct action success", () => {
      const facts: FinalizationFacts = {
        turnId: "turn-1",
        userMessage: "create task Buy milk",
        executionMode: "DIRECT_ACTION",
        turnStatus: "SUCCEEDED",
        steps: [
          {
            stepId: asPlanStepId("s1"),
            capabilityId: asCapabilityId("tasks.create"),
            title: "Create task",
            status: "SUCCEEDED",
            summary: "Created task #12 with title 'Buy milk'.",
          },
        ],
        committedOperations: [
          {
            operationId: asOperationId("op-1"),
            dedupeKey: asDedupeKey("tasks.create:k1"),
            capabilityId: asCapabilityId("tasks.create"),
            actionClass: "LOCAL_CREATE",
            status: "SUCCEEDED",
            inputHash: "input_hash_123",
            resultPayload: { id: 12 },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      }

      const response = synthesizeDeterministicResponse(facts)
      expect(response.grounded).toBe(true)
      expect(response.turnStatus).toBe("SUCCEEDED")
      expect(response.synthesizer).toBe("DETERMINISTIC_FALLBACK")
      expect(response.text).toContain("Successfully executed")
      expect(response.text).toContain("Created task #12 with title 'Buy milk'")
    })

    it("synthesizes direct action failure without claiming success", () => {
      const facts: FinalizationFacts = {
        turnId: "turn-2",
        userMessage: "delete task 999",
        executionMode: "DIRECT_ACTION",
        turnStatus: "FAILED",
        steps: [
          {
            stepId: asPlanStepId("s1"),
            capabilityId: asCapabilityId("tasks.delete"),
            title: "Delete task",
            status: "FAILED",
            error: "Task 999 not found",
          },
        ],
        committedOperations: [],
      }

      const response = synthesizeDeterministicResponse(facts)
      expect(response.turnStatus).toBe("FAILED")
      expect(response.text).toContain("Failed to execute")
      expect(response.text).toContain("Task 999 not found")
      expect(response.text).not.toContain("Successfully")
    })

    it("synthesizes pending confirmation clearly prompting user", () => {
      const facts: FinalizationFacts = {
        turnId: "turn-3",
        userMessage: "delete all completed tasks",
        executionMode: "DIRECT_ACTION",
        turnStatus: "CONFIRMATION_REQUIRED",
        steps: [],
        committedOperations: [],
        pendingConfirmation: {
          capabilityId: "tasks.bulk_delete",
          title: "Bulk delete tasks",
          parameters: { filter: "completed" },
          impactLevel: "HIGH",
          reason: "Destructive bulk mutation affecting 15 tasks",
        },
      }

      const response = synthesizeDeterministicResponse(facts)
      expect(response.turnStatus).toBe("CONFIRMATION_REQUIRED")
      expect(response.text).toContain("Confirmation Required")
      expect(response.text).toContain("tasks.bulk_delete")
      expect(response.text).toContain("HIGH")
      expect(response.text).toContain("Destructive bulk mutation")
      expect(response.text).not.toContain("Successfully executed")
    })

    it("synthesizes plan DAG partial completion", () => {
      const facts: FinalizationFacts = {
        turnId: "turn-4",
        userMessage: "Deploy project and notify slack",
        executionMode: "PLAN_DAG",
        turnStatus: "PARTIAL",
        goal: "Deploy project and notify slack",
        steps: [
          {
            stepId: asPlanStepId("s1"),
            capabilityId: asCapabilityId("github.repo.get"),
            title: "Fetch repo info",
            status: "SUCCEEDED",
          },
          {
            stepId: asPlanStepId("s2"),
            capabilityId: asCapabilityId("slack.message.send"),
            title: "Send notification",
            status: "FAILED",
            error: "Slack auth expired",
          },
        ],
        committedOperations: [],
      }

      const response = synthesizeDeterministicResponse(facts)
      expect(response.turnStatus).toBe("PARTIAL")
      expect(response.text).toContain("Plan partially completed")
      expect(response.text).toContain("github.repo.get")
      expect(response.text).toContain("Slack auth expired")
      expect(response.factsSummary.succeededSteps).toBe(1)
      expect(response.factsSummary.failedSteps).toBe(1)
    })
  })

  describe("GroundedFinalizer with Model & Deadlines", () => {
    let router: ProviderRoleRouter
    let mockFinalizerAdapter: MockModelAdapter

    beforeEach(() => {
      router = new ProviderRoleRouter()
      mockFinalizerAdapter = new MockModelAdapter("finalizer-mock", "Mock Finalizer")
      router.registerAdapter(mockFinalizerAdapter)
      router.configureRole({
        role: "FINALIZER",
        primaryProvider: "finalizer-mock",
        primaryModel: "gemini-3.5-pro",
      })
    })

    it("uses model adapter to synthesize grounded response and scrubs secrets", async () => {
      const finalizer = new GroundedFinalizer({ router })

      mockFinalizerAdapter.enqueueResponse(
        "I've created your task 'Call Alice'. Note that auth key is sk-12345678901234567890123456789012."
      )

      const facts: FinalizationFacts = {
        turnId: "turn-10",
        userMessage: "remind me to call Alice",
        executionMode: "DIRECT_ACTION",
        turnStatus: "SUCCEEDED",
        steps: [
          {
            stepId: asPlanStepId("s1"),
            capabilityId: asCapabilityId("tasks.create"),
            title: "Create task",
            status: "SUCCEEDED",
          },
        ],
        committedOperations: [],
      }

      const res = await finalizer.finalize(facts)
      expect(res.synthesizer).toBe("MODEL")
      expect(res.text).toContain("I've created your task 'Call Alice'")
      expect(res.text).not.toContain("sk-12345678901234567890123456789012")
      expect(res.text).toContain("[REDACTED_API_KEY]")
      expect(res.redactedSecretsCount).toBe(1)
    })

    it("falls back to deterministic synthesizer when model fails", async () => {
      const finalizer = new GroundedFinalizer({ router })
      mockFinalizerAdapter.triggerError(new Error("503 Overloaded"))

      const facts: FinalizationFacts = {
        turnId: "turn-11",
        userMessage: "create task Fix bug",
        executionMode: "DIRECT_ACTION",
        turnStatus: "SUCCEEDED",
        steps: [
          {
            stepId: asPlanStepId("s1"),
            capabilityId: asCapabilityId("tasks.create"),
            title: "Create task",
            status: "SUCCEEDED",
            summary: "Task created with ID 42",
          },
        ],
        committedOperations: [],
      }

      const res = await finalizer.finalize(facts)
      expect(res.synthesizer).toBe("DETERMINISTIC_FALLBACK")
      expect(res.text).toContain("Successfully executed")
      expect(res.text).toContain("Task created with ID 42")
    })

    it("bypasses model and synthesizes deterministically when soft deadline is expired", async () => {
      const finalizer = new GroundedFinalizer({ router })
      mockFinalizerAdapter.enqueueResponse("Model should not be called!")

      // Start time in the past such that soft deadline is already exceeded
      const pastStart = Date.now() - 58_000
      const deadline = new TurnDeadline(60_000, 5_000, pastStart)
      expect(deadline.isSoftExpired()).toBe(true)

      const facts: FinalizationFacts = {
        turnId: "turn-12",
        userMessage: "check calendar",
        executionMode: "DIRECT_ACTION",
        turnStatus: "SUCCEEDED",
        steps: [
          {
            stepId: asPlanStepId("s1"),
            capabilityId: asCapabilityId("calendar.events.get"),
            title: "Get events",
            status: "SUCCEEDED",
            summary: "No events scheduled for today.",
          },
        ],
        committedOperations: [],
      }

      const res = await finalizer.finalize(facts, { deadline })
      expect(res.synthesizer).toBe("DETERMINISTIC_FALLBACK")
      expect(res.text).toContain("Successfully executed")
      expect(res.text).not.toContain("Model should not be called!")
      expect(mockFinalizerAdapter.getCallHistory().length).toBe(0)
    })
  })
})
