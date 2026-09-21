import { describe, it, expect, beforeEach } from "vitest"
import { z } from "zod"
import {
  JarvisCoreRuntime,
  RuntimeTurnInput,
} from "../../lib/jarvis-core/runtime"
import {
  EventReplayBuffer,
  formatSseMessage,
  CoreStreamEvent,
  StreamSink,
} from "../../lib/jarvis-core/streaming"
import {
  ProviderRoleRouter,
  MockModelAdapter,
} from "../../lib/jarvis-core/providers"
import Database from "better-sqlite3"
import { CapabilityRegistry } from "../../lib/jarvis-core/capabilities/registry"
import { OperationLedger } from "../../lib/jarvis-core/ledger/ledger"
import { ActionPolicyManager } from "../../lib/jarvis-core/safety/policy"
import { asCapabilityId, asTurnId } from "../../lib/jarvis-core/types"

describe("JARVIS CORE V2 — C16: Core Runtime Composition, Structured Progress & SSE", () => {
  describe("Streaming & SSE Protocol Invariants", () => {
    it("formats standard W3C Server-Sent Event messages", () => {
      const event: CoreStreamEvent = {
        id: 42,
        event: "step_progress",
        timestamp: 1700000000000,
        data: { stepId: "s1", message: "Fetching database rows" },
      }

      const formatted = formatSseMessage(event)
      expect(formatted).toBe(
        'id: 42\nevent: step_progress\ndata: {"stepId":"s1","message":"Fetching database rows"}\n\n'
      )
    })

    it("EventReplayBuffer assigns monotonic sequence IDs and replays since lastId", () => {
      const buffer = new EventReplayBuffer(10)
      const e1 = buffer.push({ event: "turn_started", data: { turnId: "t1" } })
      const e2 = buffer.push({ event: "stage_changed", data: { stage: "CLASSIFYING" } })
      const e3 = buffer.push({ event: "turn_completed", data: { status: "SUCCEEDED" } })

      expect(e1.id).toBe(1)
      expect(e2.id).toBe(2)
      expect(e3.id).toBe(3)

      const replayed = buffer.getEventsSince(1)
      expect(replayed.length).toBe(2)
      expect(replayed[0].id).toBe(2)
      expect(replayed[1].id).toBe(3)
    })

    it("EventReplayBuffer bounds memory and evicts older events when full", () => {
      const smallBuffer = new EventReplayBuffer(3)
      smallBuffer.push({ event: "turn_started", data: 1 })
      smallBuffer.push({ event: "turn_started", data: 2 })
      smallBuffer.push({ event: "turn_started", data: 3 })
      smallBuffer.push({ event: "turn_started", data: 4 })

      const all = smallBuffer.getAllEvents()
      expect(all.length).toBe(3)
      expect(all[0].data).toBe(2)
      expect(all[2].data).toBe(4)
    })
  })

  describe("JarvisCoreRuntime End-to-End Execution", () => {
    let db: Database.Database
    let registry: CapabilityRegistry
    let ledger: OperationLedger
    let router: ProviderRoleRouter
    let policyManager: ActionPolicyManager
    let mockAdapter: MockModelAdapter
    let runtime: JarvisCoreRuntime

    beforeEach(() => {
      db = new Database(":memory:")
      registry = new CapabilityRegistry()
      ledger = new OperationLedger(db)
      router = new ProviderRoleRouter()
      policyManager = new ActionPolicyManager()

      mockAdapter = new MockModelAdapter("primary-mock", "Primary Mock Adapter")
      router.registerAdapter(mockAdapter)

      router.configureRole({
        role: "CHAT",
        primaryProvider: "primary-mock",
        primaryModel: "chat-model-v1",
      })

      router.configureRole({
        role: "FINALIZER",
        primaryProvider: "primary-mock",
        primaryModel: "finalizer-model-v1",
      })

      runtime = new JarvisCoreRuntime({
        registry,
        ledger,
        router,
        policyManager,
      })
    })

    it("executes conversational CHAT turn with full SSE lifecycle events", async () => {
      mockAdapter.enqueueResponse("Greetings! I am Jarvis, ready to assist.")

      const receivedEvents: CoreStreamEvent[] = []
      const sink: StreamSink = {
        write: (e) => receivedEvents.push(e),
        close: () => {},
      }

      const result = await runtime.executeTurn({
        userMessage: "Hello Jarvis",
        streamSink: sink,
      })

      expect(result.status).toBe("SUCCEEDED")
      expect(result.responseText).toContain("Greetings! I am Jarvis")

      // Verify event sequence
      const eventTypes = receivedEvents.map((e) => e.event)
      expect(eventTypes).toContain("turn_started")
      expect(eventTypes).toContain("stage_changed")
      expect(eventTypes).toContain("intent_classified")
      expect(eventTypes).toContain("response_chunk")
      expect(eventTypes).toContain("turn_completed")

      // Monotonic sequence check
      for (let i = 1; i < receivedEvents.length; i++) {
        expect(receivedEvents[i].id).toBeGreaterThan(receivedEvents[i - 1].id)
      }
    })

    it("executes direct ACTION turn and updates ledger and step facts", async () => {
      const receivedEvents: CoreStreamEvent[] = []
      const sink: StreamSink = {
        write: (e) => receivedEvents.push(e),
        close: () => {},
      }

      const result = await runtime.executeTurn({
        userMessage: "create task Buy milk",
        streamSink: sink,
      })

      expect(result.status).toBe("SUCCEEDED")
      expect(result.facts.steps.length).toBe(1)
      expect(result.facts.steps[0].capabilityId).toBe("tasks.create")
      expect(result.facts.steps[0].status).toBe("SUCCEEDED")

      // Verify step events
      const eventTypes = receivedEvents.map((e) => e.event)
      expect(eventTypes).toContain("step_started")
      expect(eventTypes).toContain("step_completed")
      expect(eventTypes).toContain("turn_completed")
    })

    it("enforces Safety Policy and emits confirmation_required on unconfirmed sensitive action", async () => {
      const receivedEvents: CoreStreamEvent[] = []
      const sink: StreamSink = {
        write: (e) => receivedEvents.push(e),
        close: () => {},
      }

      // Execute sensitive action without token
      const result = await runtime.executeTurn({
        userMessage: "delete task #42",
        streamSink: sink,
      })

      // Must pause for confirmation
      expect(result.status).toBe("CONFIRMATION_REQUIRED")
      expect(result.facts.pendingConfirmation).toBeDefined()
      expect(result.facts.pendingConfirmation?.capabilityId).toBe("tasks.delete")
      expect(result.responseText).toContain("Confirmation Required")

      const confirmEvent = receivedEvents.find((e) => e.event === "confirmation_required")
      expect(confirmEvent).toBeDefined()
      expect(confirmEvent?.data).toHaveProperty("confirmationToken")
      expect(confirmEvent?.data).toHaveProperty("impactLevel")
      expect((confirmEvent?.data as any).impactLevel).toBe("HIGH")
    })

    it("handles TurnDeadline timeout gracefully by emitting error and synthesizing truthful failure", async () => {
      // Simulate artificial delay longer than turn budget
      mockAdapter.setArtificialDelay(100)

      const receivedEvents: CoreStreamEvent[] = []
      const sink: StreamSink = {
        write: (e) => receivedEvents.push(e),
        close: () => {},
      }

      const result = await runtime.executeTurn({
        userMessage: "Hello",
        budgetMs: 40, // 40ms budget
        softBufferMs: 10,
        streamSink: sink,
      })

      expect(result.status).toBe("FAILED")
      const errorEvent = receivedEvents.find((e) => e.event === "error")
      expect(errorEvent).toBeDefined()
      expect(errorEvent?.data).toHaveProperty("code")
      expect((errorEvent?.data as any).code).toMatch(/TIMEOUT|RUNTIME_ERROR/)
      expect(result.responseText).toContain("Could not complete request")
    })

    it("supports replay buffer lookup after execution completes", async () => {
      mockAdapter.enqueueResponse("All systems operational.")

      const turnId = asTurnId("turn-replay-test")
      const result = await runtime.executeTurn({
        userMessage: "status check",
        turnId,
      })

      expect(result.events.length).toBeGreaterThan(3)
      const afterFirst = runtime.replayBuffer.getEventsSince(1)
      expect(afterFirst.length).toBe(result.events.length - 1)
    })

    it("resumes and executes sensitive action when valid confirmation token is provided", async () => {
      // Pre-create task to ensure task exists for deletion
      const createRes = await runtime.executeTurn({
        userMessage: "create task Task to delete",
      })
      const taskId = (createRes.facts.steps[0].result as any).id

      // Step 1: Initial call requests confirmation
      const initialRes = await runtime.executeTurn({
        userMessage: `delete task #${taskId}`,
      })
      expect(initialRes.status).toBe("CONFIRMATION_REQUIRED")
      const token = initialRes.facts.pendingConfirmation?.confirmationToken
      expect(token).toBeDefined()

      // Step 2: Second call provides the cryptographic token
      const confirmedRes = await runtime.executeTurn({
        userMessage: `delete task #${taskId}`,
        confirmationToken: token as any,
      })

      // The action was authorized and executed!
      expect(confirmedRes.status).toBe("SUCCEEDED")
      expect(confirmedRes.facts.steps.length).toBe(1)
      expect(confirmedRes.facts.steps[0].status).toBe("SUCCEEDED")
      expect(confirmedRes.facts.committedOperations.length).toBe(1)
    })

    it("rejects execution when forged confirmation token is provided", async () => {
      const forgedRes = await runtime.executeTurn({
        userMessage: "delete task #42",
        confirmationToken: "forged_token_000000000000" as any,
      })

      expect(forgedRes.status).toBe("FAILED")
      const errorText = forgedRes.facts.error || forgedRes.facts.steps[0]?.error
      expect(errorText).toContain("Confirmation token does not exist or has expired")
    })

    it("terminates cleanly and closes stream when client AbortSignal aborts", async () => {
      const abortController = new AbortController()
      let sinkClosed = false
      const sink: StreamSink = {
        write: () => {},
        close: () => {
          sinkClosed = true
        },
      }

      abortController.abort("Client disconnected")

      const result = await runtime.executeTurn({
        userMessage: "Hello",
        signal: abortController.signal,
        streamSink: sink,
      })

      expect(sinkClosed).toBe(true)
      expect(result.status).toBe("FAILED")
    })

    it("executes multi-step QUEST with subgoals and emits plan_created event", async () => {
      const receivedEvents: CoreStreamEvent[] = []
      const sink: StreamSink = {
        write: (e) => receivedEvents.push(e),
        close: () => {},
      }

      const result = await runtime.executeTurn({
        userMessage: "first create task Buy groceries and then create task Prepare dinner",
        streamSink: sink,
      })

      expect(result.status).toBe("SUCCEEDED")
      expect(result.facts.executionMode).toBe("PLAN_DAG")
      expect(result.facts.steps.length).toBe(2)

      const planEvent = receivedEvents.find((e) => e.event === "plan_created")
      expect(planEvent).toBeDefined()
      expect((planEvent?.data as any).stepCount).toBe(2)
    })
  })
})

