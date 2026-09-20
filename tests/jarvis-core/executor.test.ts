/**
 * JARVIS CORE V2 — DETERMINISTIC DAG EXECUTOR TEST SUITE
 * 
 * Checkpoint C11: Topological execution, parallel reads, serialized mutations,
 * reference resolution ($ref), confirmation pause/resume, Operation Ledger caching,
 * cascading blockage propagation, and crash recovery.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import Database from "better-sqlite3"
import {
  DeterministicDAGExecutor,
  type ValidatedExecutionPlan,
  type ValidatedPlanStep,
} from "../../lib/jarvis-core/executor"
import { OperationLedger } from "../../lib/jarvis-core/ledger"
import { CapabilityRegistry } from "../../lib/jarvis-core/capabilities/registry"
import type { CapabilityDefinition } from "../../lib/jarvis-core/capabilities/types"
import {
  asCapabilityId,
  asPlanId,
  asPlanStepId,
  asQuestId,
  asTraceId,
} from "../../lib/jarvis-core/types"
import { z } from "zod"

describe("JARVIS CORE V2 — Deterministic DAG Executor (C11)", () => {
  let db: Database.Database
  let ledger: OperationLedger
  let testRegistry: CapabilityRegistry
  let searchHandler: any
  let createHandler: any
  let notifyHandler: any
  let deleteHandler: any

  beforeEach(() => {
    db = new Database(":memory:")
    ledger = new OperationLedger(db)

    searchHandler = vi.fn(async (input: { query: string }) => ({
      items: [
        { id: 101, title: `Result for ${input.query}` },
        { id: 102, title: "Second Item" },
      ],
      total: 2,
    }))

    createHandler = vi.fn(async (input: { title: string; refId?: number }) => ({
      createdId: 42,
      createdTitle: input.title,
      linkedRef: input.refId ?? null,
    }))

    notifyHandler = vi.fn(async (input: { message: string; confirmed?: boolean }) => ({
      sent: true,
      deliveredTo: "user",
      content: input.message,
    }))

    deleteHandler = vi.fn(async (input: { id: number; confirmed?: boolean }) => ({
      deleted: true,
      id: input.id,
    }))

    const capabilities: CapabilityDefinition[] = [
      {
        id: asCapabilityId("research.search"),
        legacyToolName: "webSearch",
        domain: "research",
        title: "Web Search",
        description: "Search web for information",
        inputSchema: z.object({ query: z.string() }),
        handler: async (input, ctx) => searchHandler(input, ctx),
        actionClass: "READ_ONLY",
        confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
        idempotency: { idempotencyClass: "READ_ONLY" },
        requirements: {},
        availability: { staticState: "AVAILABLE", isLocallyConfigured: () => ({ available: true }) },
        routing: {},
        userFacing: true,
      },
      {
        id: asCapabilityId("tasks.create"),
        legacyToolName: "createTask",
        domain: "tasks",
        title: "Create Task",
        description: "Create a task",
        inputSchema: z.object({ title: z.string(), refId: z.number().optional() }),
        handler: async (input, ctx) => createHandler(input, ctx),
        actionClass: "LOCAL_CREATE",
        confirmation: { defaultPolicy: "NONE", criticality: "MEDIUM" },
        idempotency: { idempotencyClass: "LEDGER_REQUIRED" },
        requirements: {},
        availability: { staticState: "AVAILABLE", isLocallyConfigured: () => ({ available: true }) },
        routing: {},
        userFacing: true,
      },
      {
        id: asCapabilityId("tasks.delete"),
        legacyToolName: "deleteTask",
        domain: "tasks",
        title: "Delete Task",
        description: "Delete a task by numeric id",
        inputSchema: z.object({ id: z.number(), confirmed: z.boolean().optional() }),
        handler: async (input, ctx) => deleteHandler(input, ctx),
        actionClass: "LOCAL_DELETE",
        confirmation: { defaultPolicy: "REQUIRED", criticality: "HIGH", reason: "Destructive task deletion" },
        idempotency: { idempotencyClass: "NATURALLY_IDEMPOTENT" },
        requirements: {},
        availability: { staticState: "AVAILABLE", isLocallyConfigured: () => ({ available: true }) },
        routing: {},
        userFacing: true,
      },
      {
        id: asCapabilityId("notification.send"),
        legacyToolName: "sendNotification",
        domain: "system",
        title: "Send Notification",
        description: "Send external outbound notification",
        inputSchema: z.object({ message: z.string(), confirmed: z.boolean().optional() }),
        handler: async (input, ctx) => notifyHandler(input, ctx),
        actionClass: "EXTERNAL_SEND",
        confirmation: { defaultPolicy: "REQUIRED", criticality: "CRITICAL", reason: "External notification dispatch" },
        idempotency: { idempotencyClass: "NON_IDEMPOTENT_EXTERNAL" },
        requirements: {},
        availability: { staticState: "AVAILABLE", isLocallyConfigured: () => ({ available: true }) },
        routing: {},
        userFacing: true,
      },
    ]

    testRegistry = new CapabilityRegistry(capabilities)
  })

  function makePlan(steps: ValidatedPlanStep[]): ValidatedExecutionPlan {
    return {
      id: asPlanId(`plan_${Date.now()}`),
      questId: asQuestId(`quest_${Date.now()}`),
      traceId: asTraceId(`trace_${Date.now()}`),
      objective: "Test DAG execution",
      version: 1,
      steps,
      createdAt: Date.now(),
      topologicalOrder: steps.map((s) => s.id),
    }
  }

  // ==========================================================================
  // 1. LINEAR CHAIN & ARGUMENT RESOLUTION ($ref)
  // ==========================================================================
  describe("Linear Chain & Output Reference Resolution", () => {
    it("executes a 2-step chain resolving step output via JSON pointer", async () => {
      const step1: ValidatedPlanStep = {
        id: asPlanStepId("step_search"),
        objective: "Search query",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "deep learning" },
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "READ_ONLY",
          confirmationPolicy: "NONE",
          idempotencyClass: "READ_ONLY",
          requiresConfirmation: false,
          domain: "research",
          previewSupported: true,
        },
      }

      const step2: ValidatedPlanStep = {
        id: asPlanStepId("step_create"),
        objective: "Create task from search result",
        capabilityId: asCapabilityId("tasks.create"),
        arguments: {
          title: "Follow up on research",
          refId: { $ref: { stepId: asPlanStepId("step_search"), path: "/items/0/id" } },
        },
        dependsOn: [asPlanStepId("step_search")],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "LOCAL_CREATE",
          confirmationPolicy: "NONE",
          idempotencyClass: "LEDGER_REQUIRED",
          requiresConfirmation: false,
          domain: "tasks",
          previewSupported: true,
        },
      }

      const plan = makePlan([step1, step2])
      const executor = new DeterministicDAGExecutor(testRegistry, ledger)

      const result = await executor.executePlan(plan)

      expect(result.status).toBe("AWAITING_VERIFICATION")
      expect(result.completedSteps).toEqual([step1.id, step2.id])
      expect(searchHandler).toHaveBeenCalledTimes(1)
      expect(createHandler).toHaveBeenCalledTimes(1)
      expect(createHandler).toHaveBeenCalledWith(
        { title: "Follow up on research", refId: 101 },
        expect.anything()
      )
    })

    it("halts step cleanly with BLOCKED_WITH_REASON when referenced data is missing", async () => {
      const step1: ValidatedPlanStep = {
        id: asPlanStepId("step_search"),
        objective: "Search query",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "deep learning" },
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "READ_ONLY",
          confirmationPolicy: "NONE",
          idempotencyClass: "READ_ONLY",
          requiresConfirmation: false,
          domain: "research",
          previewSupported: true,
        },
      }

      const step2: ValidatedPlanStep = {
        id: asPlanStepId("step_create"),
        objective: "Create task with non-existent pointer",
        capabilityId: asCapabilityId("tasks.create"),
        arguments: {
          title: "Follow up",
          refId: { $ref: { stepId: asPlanStepId("step_search"), path: "/nonexistent/key" } },
        },
        dependsOn: [asPlanStepId("step_search")],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "LOCAL_CREATE",
          confirmationPolicy: "NONE",
          idempotencyClass: "LEDGER_REQUIRED",
          requiresConfirmation: false,
          domain: "tasks",
          previewSupported: true,
        },
      }

      const plan = makePlan([step1, step2])
      const executor = new DeterministicDAGExecutor(testRegistry, ledger)

      const result = await executor.executePlan(plan)

      expect(result.status).toBe("BLOCKED")
      expect(result.completedSteps).toEqual([step1.id])
      expect(result.blockedSteps).toContain(step2.id)
      expect(createHandler).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // 2. PARALLEL READS & SEQUENTIAL MUTATIONS
  // ==========================================================================
  describe("Concurrency & Serialization Invariants", () => {
    it("parallelizes independent READ_ONLY steps", async () => {
      let activeReads = 0
      let maxActiveReads = 0

      searchHandler.mockImplementation(async () => {
        activeReads += 1
        maxActiveReads = Math.max(maxActiveReads, activeReads)
        await new Promise((resolve) => setTimeout(resolve, 30))
        activeReads -= 1
        return { items: [] }
      })

      const steps: ValidatedPlanStep[] = [1, 2, 3].map((i) => ({
        id: asPlanStepId(`read_${i}`),
        objective: `Search batch ${i}`,
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: `topic ${i}` },
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "READ_ONLY",
          confirmationPolicy: "NONE",
          idempotencyClass: "READ_ONLY",
          requiresConfirmation: false,
          domain: "research",
          previewSupported: true,
        },
      }))

      const plan = makePlan(steps)
      const executor = new DeterministicDAGExecutor(testRegistry, ledger)

      const result = await executor.executePlan(plan)

      expect(result.status).toBe("AWAITING_VERIFICATION")
      expect(result.completedSteps.length).toBe(3)
      expect(maxActiveReads).toBeGreaterThan(1)
    })

    it("serializes mutating steps strictly one-by-one", async () => {
      let activeMutations = 0
      let maxActiveMutations = 0

      createHandler.mockImplementation(async () => {
        activeMutations += 1
        maxActiveMutations = Math.max(maxActiveMutations, activeMutations)
        await new Promise((resolve) => setTimeout(resolve, 20))
        activeMutations -= 1
        return { createdId: 10 }
      })

      const steps: ValidatedPlanStep[] = [1, 2, 3].map((i) => ({
        id: asPlanStepId(`mutate_${i}`),
        objective: `Create task ${i}`,
        capabilityId: asCapabilityId("tasks.create"),
        arguments: { title: `Task ${i}` },
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "LOCAL_CREATE",
          confirmationPolicy: "NONE",
          idempotencyClass: "LEDGER_REQUIRED",
          requiresConfirmation: false,
          domain: "tasks",
          previewSupported: true,
        },
      }))

      const plan = makePlan(steps)
      const executor = new DeterministicDAGExecutor(testRegistry, ledger)

      const result = await executor.executePlan(plan)

      expect(result.status).toBe("AWAITING_VERIFICATION")
      expect(result.completedSteps.length).toBe(3)
      expect(maxActiveMutations).toBe(1) // Strictly serialized!
    })
  })

  // ==========================================================================
  // 3. CONFIRMATION PAUSE & RESUME
  // ==========================================================================
  describe("Confirmation Pause & Resume Invariant", () => {
    it("pauses on confirmation requirement with exact step identity and preview", async () => {
      const step1: ValidatedPlanStep = {
        id: asPlanStepId("step_search"),
        objective: "Read information",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "target id" },
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "READ_ONLY",
          confirmationPolicy: "NONE",
          idempotencyClass: "READ_ONLY",
          requiresConfirmation: false,
          domain: "research",
          previewSupported: true,
        },
      }

      const step2: ValidatedPlanStep = {
        id: asPlanStepId("step_delete"),
        objective: "Delete task",
        capabilityId: asCapabilityId("tasks.delete"),
        arguments: { id: 42 },
        dependsOn: [asPlanStepId("step_search")],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "LOCAL_DELETE",
          confirmationPolicy: "REQUIRED",
          idempotencyClass: "NATURALLY_IDEMPOTENT",
          requiresConfirmation: true, // Runtime derived
          domain: "tasks",
          previewSupported: true,
        },
      }

      const plan = makePlan([step1, step2])
      const executor = new DeterministicDAGExecutor(testRegistry, ledger)

      // First run without confirmation
      const pausedResult = await executor.executePlan(plan)

      expect(pausedResult.status).toBe("PAUSED_FOR_CONFIRMATION")
      expect(pausedResult.completedSteps).toEqual([step1.id])
      expect(pausedResult.confirmationRequest).toBeDefined()
      expect(pausedResult.confirmationRequest?.stepId).toBe(step2.id)
      expect(pausedResult.confirmationRequest?.capabilityId).toBe("tasks.delete")
      expect(pausedResult.confirmationRequest?.actionClass).toBe("LOCAL_DELETE")
      expect(pausedResult.confirmationRequest?.arguments).toEqual({ id: 42 })
      expect(deleteHandler).not.toHaveBeenCalled()

      // Second run: resume with user confirmation
      const resumedResult = await executor.resumePlan(plan, step2.id)

      expect(resumedResult.status).toBe("AWAITING_VERIFICATION")
      expect(resumedResult.completedSteps).toEqual([step1.id, step2.id])
      expect(deleteHandler).toHaveBeenCalledTimes(1)
      expect(searchHandler).toHaveBeenCalledTimes(1) // Step 1 was not re-executed!
    })
  })

  // ==========================================================================
  // 4. OPERATION LEDGER IDEMPOTENCY & CACHING
  // ==========================================================================
  describe("Operation Ledger Idempotency & Replay", () => {
    it("claims operation in ledger and reuses cached result on re-execution", async () => {
      const step: ValidatedPlanStep = {
        id: asPlanStepId("step_task"),
        objective: "Create unique task",
        capabilityId: asCapabilityId("tasks.create"),
        arguments: { title: "Buy groceries" },
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "LOCAL_CREATE",
          confirmationPolicy: "NONE",
          idempotencyClass: "LEDGER_REQUIRED",
          requiresConfirmation: false,
          domain: "tasks",
          previewSupported: true,
        },
      }

      const plan = makePlan([step])
      const executor = new DeterministicDAGExecutor(testRegistry, ledger)

      // First run
      const res1 = await executor.executePlan(plan)
      expect(res1.status).toBe("AWAITING_VERIFICATION")
      expect(createHandler).toHaveBeenCalledTimes(1)

      // Re-run identical plan
      const res2 = await executor.executePlan(plan)
      expect(res2.status).toBe("AWAITING_VERIFICATION")
      expect(res2.completedSteps).toEqual([step.id])
      // Handler MUST NOT be called again — served from ledger cache!
      expect(createHandler).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // 5. CASCADING BLOCKAGE PROPAGATION
  // ==========================================================================
  describe("Cascading Failure & Blockage Propagation", () => {
    it("propagates BLOCKED_WITH_REASON to dependent steps when a step fails permanently", async () => {
      searchHandler.mockRejectedValue(new Error("Network timeout 504"))

      const step1: ValidatedPlanStep = {
        id: asPlanStepId("step_fail"),
        objective: "Failing search",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "fail" },
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "READ_ONLY",
          confirmationPolicy: "NONE",
          idempotencyClass: "READ_ONLY",
          requiresConfirmation: false,
          domain: "research",
          previewSupported: true,
        },
      }

      const step2: ValidatedPlanStep = {
        id: asPlanStepId("step_dependent"),
        objective: "Follow up task",
        capabilityId: asCapabilityId("tasks.create"),
        arguments: { title: "Never runs" },
        dependsOn: [asPlanStepId("step_fail")],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "LOCAL_CREATE",
          confirmationPolicy: "NONE",
          idempotencyClass: "LEDGER_REQUIRED",
          requiresConfirmation: false,
          domain: "tasks",
          previewSupported: true,
        },
      }

      const plan = makePlan([step1, step2])
      const executor = new DeterministicDAGExecutor(testRegistry, ledger)

      const result = await executor.executePlan(plan)

      expect(result.status).toBe("FAILED")
      expect(result.failedSteps).toContain(step1.id)
      expect(result.blockedSteps).toContain(step2.id)
      expect(createHandler).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // 6. CRASH RECOVERY RECONCILIATION
  // ==========================================================================
  describe("Crash Recovery Reconciliation", () => {
    it("recovers plan state from ledger without re-executing completed steps", async () => {
      const step1: ValidatedPlanStep = {
        id: asPlanStepId("step_1"),
        objective: "Completed step before crash",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "already done" },
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "READ_ONLY",
          confirmationPolicy: "NONE",
          idempotencyClass: "READ_ONLY",
          requiresConfirmation: false,
          domain: "research",
          previewSupported: true,
        },
      }

      const step2: ValidatedPlanStep = {
        id: asPlanStepId("step_2"),
        objective: "Pending step after crash",
        capabilityId: asCapabilityId("tasks.create"),
        arguments: { title: "Run after crash" },
        dependsOn: [asPlanStepId("step_1")],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "LOCAL_CREATE",
          confirmationPolicy: "NONE",
          idempotencyClass: "LEDGER_REQUIRED",
          requiresConfirmation: false,
          domain: "tasks",
          previewSupported: true,
        },
      }

      const plan = makePlan([step1, step2])

      // Seed step 1 directly into ledger as SUCCEEDED (simulating pre-crash state)
      const opId1 = ledger.claimOperation({
        operationId: undefined,
        capabilityId: step1.capabilityId,
        actionClass: "READ_ONLY",
        idempotencyClass: "READ_ONLY",
        input: step1.arguments,
        questId: plan.questId,
        stepId: step1.id,
      })
      if (opId1.status === "CLAIMED") {
        ledger.completeOperation({
          operationId: opId1.operationId,
          resultPayload: { recovered: true },
        })
      }

      const executor = new DeterministicDAGExecutor(testRegistry, ledger)
      const summary = await executor.recoverPlan(plan)

      expect(summary.recoveredStepsCount).toBe(1)
      expect(summary.completedFromLedger).toContain(step1.id)
      expect(summary.pendingSteps).toContain(step2.id)
    })
  })

  // ==========================================================================
  // 7. CANCELLATION
  // ==========================================================================
  describe("Plan Cancellation", () => {
    it("halts execution when abortSignal is triggered", async () => {
      const abortController = new AbortController()
      abortController.abort() // Immediately aborted

      const step: ValidatedPlanStep = {
        id: asPlanStepId("step_abort"),
        objective: "Cancelled step",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "abort test" },
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
        required: true,
        trustedMetadata: {
          actionClass: "READ_ONLY",
          confirmationPolicy: "NONE",
          idempotencyClass: "READ_ONLY",
          requiresConfirmation: false,
          domain: "research",
          previewSupported: true,
        },
      }

      const plan = makePlan([step])
      const executor = new DeterministicDAGExecutor(testRegistry, ledger)

      const result = await executor.executePlan(plan, { abortSignal: abortController.signal })

      expect(result.status).toBe("CANCELLED")
      expect(searchHandler).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // 8. 50-RUN CONCURRENCY STRESS TEST (0 Race Conditions)
  // ==========================================================================
  describe("50-Run Concurrency Stress Test", () => {
    it("executes 50 parallel independent runs without race conditions or memory corruption", async () => {
      const plans = Array.from({ length: 50 }, (_, i) => {
        const step: ValidatedPlanStep = {
          id: asPlanStepId(`stress_step_${i}`),
          objective: `Stress test run ${i}`,
          capabilityId: asCapabilityId("research.search"),
          arguments: { query: `stress_${i}` },
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
          trustedMetadata: {
            actionClass: "READ_ONLY",
            confirmationPolicy: "NONE",
            idempotencyClass: "READ_ONLY",
            requiresConfirmation: false,
            domain: "research",
            previewSupported: true,
          },
        }
        return makePlan([step])
      })

      const executor = new DeterministicDAGExecutor(testRegistry, ledger)

      const results = await Promise.all(plans.map((p) => executor.executePlan(p)))

      expect(results.length).toBe(50)
      for (const res of results) {
        expect(res.status).toBe("AWAITING_VERIFICATION")
        expect(res.completedSteps.length).toBe(1)
        expect(res.failedSteps.length).toBe(0)
      }
    })
  })
})
