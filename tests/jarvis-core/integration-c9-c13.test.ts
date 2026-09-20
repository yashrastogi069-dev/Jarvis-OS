/**
 * JARVIS CORE V2 — CROSS-CHECKPOINT INTEGRATION GATE (C9 → C13)
 * 
 * Comprehensive end-to-end integration test suite verifying the complete
 * orchestration stack:
 * C9: Structured DAG Planner
 * C10: Deterministic Plan Validator
 * C11: Deterministic DAG Executor
 * C12: Terminal Completion Verifier
 * C13: Controlled Replanner
 * 
 * 20 Canonical Headless Scenarios:
 * 1. End-to-end plan generation, validation, execution, and verification.
 * 2. Parallel read fan-out into sequential create.
 * 3. Two-phase confirmation pause, inspection, resume, and completion.
 * 4. Argument passing via RFC 6901 JSON pointer across 3 steps.
 * 5. Replan trigger on missing prerequisite and successful patch execution.
 * 6. Replan budget exhaustion (2 attempts maximum) transitioning to FAILED.
 * 7. Idempotent deduplication via Operation Ledger caching on replay.
 * 8. Crash recovery mid-execution without re-executing committed steps.
 * 9. UNKNOWN_COMMIT blocking downstream steps safely.
 * 10. Direct ACTION vs QUEST isolation.
 * 11. Multi-domain connector workflow (Tasks + Research + Notifications).
 * 12. Cascading error propagation on unrecoverable failure.
 * 13. Optional step failure permits PARTIALLY_COMPLETED status.
 * 14. Mid-flight plan cancellation via AbortSignal.
 * 15. Structural rejection of cycles during validation.
 * 16. Structural rejection of invalid schemas and unrouted capabilities.
 * 17. Forward reference and undeclared dependency rejection in $ref.
 * 18. Prototype pollution and unsafe path guard in $ref.
 * 19. Plan complexity bound limits enforcement.
 * 20. 25-run concurrent stress test (0 race conditions, 0 deadlocks).
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import Database from "better-sqlite3"
import { z } from "zod"

// Core types & IDs
import {
  asCapabilityId,
  asPlanId,
  asPlanStepId,
  asQuestId,
  asTraceId,
  asTurnId,
} from "../../lib/jarvis-core/types"

// C2 Capabilities
import { CapabilityRegistry } from "../../lib/jarvis-core/capabilities/registry"
import type { CapabilityDefinition } from "../../lib/jarvis-core/capabilities/types"

// C4 Safety
import { ActionPolicyManager } from "../../lib/jarvis-core/safety"

// C5 Ledger
import { OperationLedger } from "../../lib/jarvis-core/ledger"
import { computeDedupeKey, deriveQuestStepOperationId } from "../../lib/jarvis-core/ledger/canonical"

// C8 Quest Engine
import { QuestEngine } from "../../lib/jarvis-core/quest"

// C9 Planner
import {
  StructuredPlanner,
  type ExecutionPlan,
  type PlannerModelAdapter,
  type PlannerStep,
} from "../../lib/jarvis-core/planner"

// C10 Validator
import {
  DeterministicPlanValidator,
  type ValidatedExecutionPlan,
} from "../../lib/jarvis-core/planner/validator"

// C11 Executor
import { DeterministicDAGExecutor } from "../../lib/jarvis-core/executor"

// C12 Verifier
import { TerminalCompletionVerifier } from "../../lib/jarvis-core/verifier"

// C13 Replanner
import { ControlledReplanner } from "../../lib/jarvis-core/planner/replanner"

describe("JARVIS CORE V2 — Cross-Checkpoint Integration Gate (C9 → C13)", () => {
  let db: Database.Database
  let ledger: OperationLedger
  let questEngine: QuestEngine
  let policyManager: ActionPolicyManager
  let testRegistry: CapabilityRegistry
  let validator: DeterministicPlanValidator
  let executor: DeterministicDAGExecutor
  let verifier: TerminalCompletionVerifier
  let replanner: ControlledReplanner

  // Handler mocks
  let searchHandler: any
  let listTasksHandler: any
  let searchMemoryHandler: any
  let createHandler: any
  let deleteHandler: any
  let notifyHandler: any

  beforeEach(() => {
    db = new Database(":memory:")
    db.pragma("journal_mode = WAL")

    ledger = new OperationLedger(db)
    questEngine = new QuestEngine(db)
    policyManager = new ActionPolicyManager()

    searchHandler = vi.fn(async (input: { query: string }) => ({
      results: [{ id: "res-1", snippet: `Information about ${input.query}` }],
      count: 1,
    }))

    listTasksHandler = vi.fn(async (_input: { status?: string }) => ({
      tasks: [{ id: 1, title: "Existing task" }],
      total: 1,
    }))

    searchMemoryHandler = vi.fn(async (input: { query: string }) => ({
      memories: [{ id: "mem-1", text: `Memory match for ${input.query}` }],
    }))

    createHandler = vi.fn(async (input: { title: string; refId?: number }) => ({
      id: 42,
      title: input.title,
      linkedRef: input.refId ?? null,
      status: "open",
    }))

    deleteHandler = vi.fn(async (input: { id: number; confirmed?: boolean }) => ({
      deleted: true,
      id: input.id,
    }))

    notifyHandler = vi.fn(async (input: { message: string; confirmed?: boolean }) => ({
      sent: true,
      message: input.message,
    }))

    const capabilities: CapabilityDefinition[] = [
      {
        id: asCapabilityId("research.search"),
        legacyToolName: "webSearch",
        domain: "research",
        title: "Web Search",
        description: "Search web for real-time information",
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
        id: asCapabilityId("tasks.list"),
        legacyToolName: "listTasks",
        domain: "tasks",
        title: "List Tasks",
        description: "List tasks",
        inputSchema: z.object({ status: z.string().optional() }),
        handler: async (input, ctx) => listTasksHandler(input, ctx),
        actionClass: "READ_ONLY",
        confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
        idempotency: { idempotencyClass: "READ_ONLY" },
        requirements: {},
        availability: { staticState: "AVAILABLE", isLocallyConfigured: () => ({ available: true }) },
        routing: {},
        userFacing: true,
      },
      {
        id: asCapabilityId("memory.search"),
        legacyToolName: "searchMemory",
        domain: "memory",
        title: "Search Memory",
        description: "Search semantic memories",
        inputSchema: z.object({ query: z.string() }),
        handler: async (input, ctx) => searchMemoryHandler(input, ctx),
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
        description: "Create a reminder task",
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
        description: "Delete task by numeric ID",
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
        description: "Send outbound user notification",
        inputSchema: z.object({ message: z.string(), confirmed: z.boolean().optional() }),
        handler: async (input, ctx) => notifyHandler(input, ctx),
        actionClass: "EXTERNAL_SEND",
        confirmation: { defaultPolicy: "REQUIRED", criticality: "CRITICAL", reason: "External notification" },
        idempotency: { idempotencyClass: "NON_IDEMPOTENT_EXTERNAL" },
        requirements: {},
        availability: { staticState: "AVAILABLE", isLocallyConfigured: () => ({ available: true }) },
        routing: {},
        userFacing: true,
      },
    ]

    testRegistry = new CapabilityRegistry(capabilities)
    validator = new DeterministicPlanValidator(testRegistry)
    executor = new DeterministicDAGExecutor(testRegistry, ledger)
    verifier = new TerminalCompletionVerifier(ledger, questEngine)
    replanner = new ControlledReplanner(validator)
  })

  // Helper to build typed planner steps
  function makeStep(params: {
    id: string
    objective: string
    capabilityId: string
    arguments?: Record<string, any>
    dependsOn?: string[]
    required?: boolean
    completionCriteria?: any[]
  }): PlannerStep {
    return {
      id: asPlanStepId(params.id),
      objective: params.objective,
      capabilityId: asCapabilityId(params.capabilityId),
      arguments: (params.arguments ?? {}) as any,
      dependsOn: (params.dependsOn ?? []).map(asPlanStepId),
      required: params.required !== false,
      completionCriteria: params.completionCriteria ?? [],
    }
  }

  // Helper to construct and validate raw plans
  function createAndValidatePlan(params: {
    planId?: string
    questId?: string
    objective: string
    steps: PlannerStep[]
  }): ValidatedExecutionPlan {
    const rawPlan: ExecutionPlan = {
      id: asPlanId(params.planId ?? `plan_${Date.now()}`),
      questId: asQuestId(params.questId ?? `quest_${Date.now()}`),
      traceId: asTraceId(`trace_${Date.now()}`),
      objective: params.objective,
      version: 1,
      steps: params.steps,
      createdAt: Date.now(),
    }

    const valResult = validator.validate(rawPlan)
    if (!valResult.valid) {
      throw new Error(`Plan validation failed: ${valResult.issues.map((i) => i.message).join("; ")}`)
    }
    return valResult.plan
  }

  // ==========================================================================
  // SCENARIO 1: End-to-End Plan Generation, Validation, Execution & Verification
  // ==========================================================================
  it("Scenario 1: End-to-end plan generation, validation, execution, and verification", async () => {
    // 1. Structured Planner generates plan via adapter
    const mockAdapter: PlannerModelAdapter = {
      generatePlan: vi.fn(async () => ({
        id: "plan_s1",
        questId: "quest_s1",
        traceId: "trace_s1",
        objective: "Research AI and record reminder",
        version: 1,
        steps: [
          {
            id: "step_1",
            objective: "Search AI advancements",
            capabilityId: "research.search",
            arguments: { query: "Agentic AI 2026" },
            dependsOn: [],
            required: true,
            completionCriteria: [{ type: "OUTPUT_PRESENT", fieldPointer: "/count" }],
          },
          {
            id: "step_2",
            objective: "Create reminder task",
            capabilityId: "tasks.create",
            arguments: { title: "Review Agentic AI findings" },
            dependsOn: ["step_1"],
            required: true,
            completionCriteria: [{ type: "OUTPUT_PRESENT", fieldPointer: "/id" }],
          },
        ],
      })),
    }

    const planner = new StructuredPlanner(mockAdapter)
    const planResult = await planner.plan({
      questId: asQuestId("quest_s1"),
      traceId: asTraceId("trace_s1"),
      objective: "Research AI and record reminder",
      capabilities: [
        {
          id: asCapabilityId("research.search"),
          domain: "research",
          description: "Search web",
          actionClass: "READ_ONLY",
          inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        },
        {
          id: asCapabilityId("tasks.create"),
          domain: "tasks",
          description: "Create task",
          actionClass: "LOCAL_CREATE",
          inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
        },
      ],
    })

    expect(planResult.success).toBe(true)
    if (!planResult.success) throw new Error("Plan generation failed")

    // 2. Deterministic Validation
    const valResult = validator.validate(planResult.plan)
    expect(valResult.valid).toBe(true)
    if (!valResult.valid) throw new Error("Validation failed")

    // Persist quest in QuestEngine
    questEngine.createQuest({
      questId: valResult.plan.questId,
      sessionId: "session_s1",
      title: valResult.plan.objective,
      prompt: valResult.plan.objective,
    })

    // 3. Deterministic Execution (Leaves status in AWAITING_VERIFICATION for C12 verifier)
    const execResult = await executor.executePlan(valResult.plan)
    expect(execResult.status).toBe("AWAITING_VERIFICATION")
    expect(execResult.completedSteps).toHaveLength(2)

    // 4. Terminal Completion Verification
    const verResult = await verifier.verifyPlan(valResult.plan, execResult)
    expect(verResult.finalStatus).toBe("COMPLETED")
    expect(verResult.verified).toBe(true)
    expect(verResult.unfulfilledRequiredSteps).toHaveLength(0)

    // Assert SQLite Quest state was synchronized to SUCCEEDED
    const savedQuest = questEngine.getQuest(valResult.plan.questId)
    expect(savedQuest?.status).toBe("SUCCEEDED")
  })

  // ==========================================================================
  // SCENARIO 2: Parallel Read Fan-Out into Sequential Create
  // ==========================================================================
  it("Scenario 2: Parallel read fan-out into sequential create", async () => {
    let concurrentReads = 0
    let maxConcurrentReadsObserved = 0

    searchHandler.mockImplementation(async () => {
      concurrentReads++
      maxConcurrentReadsObserved = Math.max(maxConcurrentReadsObserved, concurrentReads)
      await new Promise((resolve) => setTimeout(resolve, 30))
      concurrentReads--
      return { count: 1 }
    })

    listTasksHandler.mockImplementation(async () => {
      concurrentReads++
      maxConcurrentReadsObserved = Math.max(maxConcurrentReadsObserved, concurrentReads)
      await new Promise((resolve) => setTimeout(resolve, 30))
      concurrentReads--
      return { total: 1 }
    })

    searchMemoryHandler.mockImplementation(async () => {
      concurrentReads++
      maxConcurrentReadsObserved = Math.max(maxConcurrentReadsObserved, concurrentReads)
      await new Promise((resolve) => setTimeout(resolve, 30))
      concurrentReads--
      return { memories: [] }
    })

    const plan = createAndValidatePlan({
      objective: "Gather context from 3 sources and create composite task",
      steps: [
        makeStep({
          id: "read_web",
          objective: "Read web",
          capabilityId: "research.search",
          arguments: { query: "status" },
        }),
        makeStep({
          id: "read_tasks",
          objective: "Read tasks",
          capabilityId: "tasks.list",
          arguments: {},
        }),
        makeStep({
          id: "read_memory",
          objective: "Read memory",
          capabilityId: "memory.search",
          arguments: { query: "context" },
        }),
        makeStep({
          id: "create_task",
          objective: "Create synthesis task",
          capabilityId: "tasks.create",
          arguments: { title: "Synthesis of 3 parallel reads" },
          dependsOn: ["read_web", "read_tasks", "read_memory"],
        }),
      ],
    })

    const execResult = await executor.executePlan(plan, { maxConcurrentReads: 4 })
    expect(execResult.status).toBe("AWAITING_VERIFICATION")
    expect(execResult.completedSteps).toHaveLength(4)
    // Proven: parallel execution occurred for the 3 reads
    expect(maxConcurrentReadsObserved).toBeGreaterThanOrEqual(2)
  })

  // ==========================================================================
  // SCENARIO 3: Two-Phase Confirmation Pause, Inspection, Resume & Completion
  // ==========================================================================
  it("Scenario 3: Two-phase confirmation pause, inspection, resume, and completion", async () => {
    const plan = createAndValidatePlan({
      objective: "Read task and then delete it with confirmation",
      steps: [
        makeStep({
          id: "step_read",
          objective: "Inspect tasks",
          capabilityId: "tasks.list",
        }),
        makeStep({
          id: "step_delete",
          objective: "Delete dangerous task",
          capabilityId: "tasks.delete",
          arguments: { id: 99 },
          dependsOn: ["step_read"],
        }),
      ],
    })

    // Phase 1: Execution pauses before the destructive delete step
    const pausedResult = await executor.executePlan(plan)
    expect(pausedResult.status).toBe("PAUSED_FOR_CONFIRMATION")
    expect(pausedResult.confirmationRequest).toBeDefined()
    expect(pausedResult.confirmationRequest?.stepId).toBe("step_delete")
    expect(pausedResult.confirmationRequest?.actionClass).toBe("LOCAL_DELETE")
    expect(pausedResult.confirmationRequest?.preview.criticality).toBe("HIGH")
    expect(deleteHandler).not.toHaveBeenCalled()

    // Phase 2: Resume with explicit user confirmation for step_delete
    const resumedResult = await executor.executePlan(plan, {
      confirmedSteps: [asPlanStepId("step_delete")],
    })

    expect(resumedResult.status).toBe("AWAITING_VERIFICATION")
    expect(resumedResult.completedSteps).toEqual(["step_read", "step_delete"])
    expect(deleteHandler).toHaveBeenCalledTimes(1)

    const verResult = await verifier.verifyPlan(plan, resumedResult)
    expect(verResult.finalStatus).toBe("COMPLETED")
    expect(verResult.verified).toBe(true)
  })

  // ==========================================================================
  // SCENARIO 4: Argument Passing via RFC 6901 JSON Pointer Across 3 Steps
  // ==========================================================================
  it("Scenario 4: Argument passing via RFC 6901 JSON pointer across 3 steps", async () => {
    searchHandler.mockResolvedValueOnce({
      meta: {
        envelope: {
          targetCode: 108,
          slug: "AI-108",
        },
      },
    })

    createHandler.mockImplementationOnce(async (input: any) => ({
      id: input.refId,
      label: `Task for ${input.refId}`,
      deep: {
        messageText: `Done with ref ${input.refId}`,
      },
    }))

    const plan = createAndValidatePlan({
      objective: "Chain arguments across 3 steps using JSON pointer $ref",
      steps: [
        makeStep({
          id: "step_1",
          objective: "Fetch metadata",
          capabilityId: "research.search",
          arguments: { query: "fetch code" },
        }),
        makeStep({
          id: "step_2",
          objective: "Create task with refId from step_1",
          capabilityId: "tasks.create",
          arguments: {
            title: "Linked Task",
            refId: { $ref: { stepId: asPlanStepId("step_1"), path: "/meta/envelope/targetCode" } },
          },
          dependsOn: ["step_1"],
        }),
        makeStep({
          id: "step_3",
          objective: "Send notification with message from step_2",
          capabilityId: "notification.send",
          arguments: {
            message: { $ref: { stepId: asPlanStepId("step_2"), path: "/deep/messageText" } },
          },
          dependsOn: ["step_2"],
        }),
      ],
    })

    // Execute with confirmation for step_3 (EXTERNAL_SEND)
    const result = await executor.executePlan(plan, {
      confirmedSteps: [asPlanStepId("step_3")],
    })

    expect(result.status).toBe("AWAITING_VERIFICATION")
    expect(createHandler).toHaveBeenCalledWith(
      expect.objectContaining({ refId: 108 }),
      expect.anything()
    )
    expect(notifyHandler).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Done with ref 108" }),
      expect.anything()
    )
  })

  // ==========================================================================
  // SCENARIO 5: Replan Trigger on Missing Prerequisite and Patch Execution
  // ==========================================================================
  it("Scenario 5: Replan trigger on missing prerequisite and successful patch execution", async () => {
    // Step 2 fails because prerequisite task was not found
    createHandler.mockRejectedValueOnce(new Error("Prerequisite task not found in database"))

    const plan = createAndValidatePlan({
      objective: "Read and create with potential prerequisite failure",
      steps: [
        makeStep({
          id: "step_read",
          objective: "Read tasks",
          capabilityId: "tasks.list",
        }),
        makeStep({
          id: "step_create",
          objective: "Create task dependent on missing prerequisite",
          capabilityId: "tasks.create",
          arguments: { title: "Dependent task" },
          dependsOn: ["step_read"],
        }),
      ],
    })

    const initialResult = await executor.executePlan(plan)
    expect(initialResult.status).toBe("FAILED")

    // 1. Evaluate Replan Eligibility
    const eligibility = replanner.evaluateReplanEligibility(
      plan,
      asPlanStepId("step_create"),
      "Prerequisite task not found in database",
      0
    )
    expect(eligibility.eligible).toBe(true)
    expect(eligibility.trigger).toBe("MISSING_PREREQUISITE")

    // 2. Patch execution plan with prerequisite step + retry
    createHandler.mockResolvedValueOnce({ id: 999, title: "Resolved" })

    const replanResult = await replanner.replan(plan, {
      failedStepId: asPlanStepId("step_create"),
      trigger: "MISSING_PREREQUISITE",
      reason: "Prerequisite task not found in database",
      attemptCount: 0,
      completedStepIds: [asPlanStepId("step_read")],
      replacementSteps: [
        makeStep({
          id: "step_prereq_create",
          objective: "Create prerequisite task",
          capabilityId: "tasks.create",
          arguments: { title: "Prerequisite Task" },
          dependsOn: ["step_read"],
        }),
        makeStep({
          id: "step_create_retry",
          objective: "Retry dependent task",
          capabilityId: "tasks.create",
          arguments: { title: "Dependent task" },
          dependsOn: ["step_prereq_create"],
        }),
      ],
    })

    expect(replanResult.success).toBe(true)
    if (!replanResult.success || !replanResult.newPlan) throw new Error("Replan failed")

    // Completed step_read preserved
    expect(replanResult.preservedStepIds).toContain("step_read")
    expect(replanResult.prunedStepIds).toContain("step_create")

    // 3. Execute patched composite plan
    const patchedExecResult = await executor.executePlan(replanResult.newPlan)
    expect(patchedExecResult.status).toBe("AWAITING_VERIFICATION")
    expect(patchedExecResult.completedSteps).toContain("step_prereq_create")
    expect(patchedExecResult.completedSteps).toContain("step_create_retry")
  })

  // ==========================================================================
  // SCENARIO 6: Replan Budget Exhaustion (2 Attempts Max) Transitioning to FAILED
  // ==========================================================================
  it("Scenario 6: Replan budget exhaustion (2 attempts maximum) transitioning to FAILED", async () => {
    const plan = createAndValidatePlan({
      objective: "Failing plan to test replan budget",
      steps: [
        makeStep({
          id: "step_fail",
          objective: "Failing step",
          capabilityId: "tasks.create",
          arguments: { title: "Fail" },
        }),
      ],
    })

    // Attempt 0 -> Eligible
    const eval0 = replanner.evaluateReplanEligibility(plan, asPlanStepId("step_fail"), "Prerequisite missing", 0)
    expect(eval0.eligible).toBe(true)
    expect(eval0.remainingAttempts).toBe(2)

    // Attempt 1 -> Eligible
    const eval1 = replanner.evaluateReplanEligibility(plan, asPlanStepId("step_fail"), "Prerequisite missing", 1)
    expect(eval1.eligible).toBe(true)
    expect(eval1.remainingAttempts).toBe(1)

    // Attempt 2 -> Ineligible: Budget Exhausted!
    const eval2 = replanner.evaluateReplanEligibility(plan, asPlanStepId("step_fail"), "Prerequisite missing", 2)
    expect(eval2.eligible).toBe(false)
    expect(eval2.remainingAttempts).toBe(0)
    expect(eval2.reason).toContain("Replan budget exhausted")

    // Direct replan rejection on exhausted budget
    const replanReject = await replanner.replan(plan, {
      failedStepId: asPlanStepId("step_fail"),
      trigger: "RECOVERABLE_STEP_FAILURE",
      reason: "Budget check",
      attemptCount: 2,
      completedStepIds: [],
      replacementSteps: [],
    })
    expect(replanReject.success).toBe(false)
    expect(replanReject.error).toContain("exceeds limit")
  })

  // ==========================================================================
  // SCENARIO 7: Idempotent Deduplication via Operation Ledger Caching on Replay
  // ==========================================================================
  it("Scenario 7: Idempotent deduplication via Operation Ledger caching on replay", async () => {
    const plan = createAndValidatePlan({
      objective: "Idempotent execution test",
      steps: [
        makeStep({
          id: "step_create",
          objective: "Create task once",
          capabilityId: "tasks.create",
          arguments: { title: "Unique task" },
        }),
      ],
    })

    // Run 1: Capability executes and stores result in Operation Ledger
    const result1 = await executor.executePlan(plan)
    expect(result1.status).toBe("AWAITING_VERIFICATION")
    expect(createHandler).toHaveBeenCalledTimes(1)

    // Run 2: Same plan & quest replayed (e.g. resubmission or retry)
    const result2 = await executor.executePlan(plan)
    expect(result2.status).toBe("AWAITING_VERIFICATION")
    // Proven: capability handler was NOT called again; served from ledger cache
    expect(createHandler).toHaveBeenCalledTimes(1)
    expect(result2.stepResults.get(asPlanStepId("step_create"))).toEqual({
      id: 42,
      title: "Unique task",
      linkedRef: null,
      status: "open",
    })
  })

  // ==========================================================================
  // SCENARIO 8: Crash Recovery Mid-Execution Without Re-Executing Committed Steps
  // ==========================================================================
  it("Scenario 8: Crash recovery mid-execution without re-executing committed steps", async () => {
    const plan = createAndValidatePlan({
      objective: "3-step workflow for crash recovery",
      steps: [
        makeStep({
          id: "step_1",
          objective: "Step 1",
          capabilityId: "research.search",
          arguments: { query: "test" },
        }),
        makeStep({
          id: "step_2",
          objective: "Step 2",
          capabilityId: "tasks.create",
          arguments: { title: "Step 2 Task" },
          dependsOn: ["step_1"],
        }),
        makeStep({
          id: "step_3",
          objective: "Step 3",
          capabilityId: "tasks.list",
          dependsOn: ["step_2"],
        }),
      ],
    })

    // Manually record Step 1 and Step 2 as already committed in the SQLite ledger
    const opId1 = deriveQuestStepOperationId(plan.questId, asPlanStepId("step_1"), asCapabilityId("research.search"))
    ledger.claimOperation({
      capabilityId: asCapabilityId("research.search"),
      actionClass: "READ_ONLY",
      idempotencyClass: "READ_ONLY",
      input: { query: "test" },
      questId: plan.questId,
      stepId: asPlanStepId("step_1"),
      operationId: opId1,
    })
    ledger.completeOperation({ operationId: opId1, resultPayload: { results: ["pre-crash"] } })

    const opId2 = deriveQuestStepOperationId(plan.questId, asPlanStepId("step_2"), asCapabilityId("tasks.create"))
    ledger.claimOperation({
      capabilityId: asCapabilityId("tasks.create"),
      actionClass: "LOCAL_CREATE",
      idempotencyClass: "LEDGER_REQUIRED",
      input: { title: "Step 2 Task" },
      questId: plan.questId,
      stepId: asPlanStepId("step_2"),
      operationId: opId2,
    })
    ledger.completeOperation({ operationId: opId2, resultPayload: { id: 200, title: "Step 2 Task" } })

    // Simulate system restart: instantiate brand new Executor on same ledger
    const recoveredExecutor = new DeterministicDAGExecutor(testRegistry, ledger)
    const result = await recoveredExecutor.executePlan(plan)

    expect(result.status).toBe("AWAITING_VERIFICATION")
    expect(result.completedSteps).toEqual(["step_1", "step_2", "step_3"])
    // Step 1 and Step 2 handlers were NOT invoked because they were committed before the crash!
    expect(searchHandler).not.toHaveBeenCalled()
    expect(createHandler).not.toHaveBeenCalled()
    // Step 3 was executed cleanly
    expect(listTasksHandler).toHaveBeenCalledTimes(1)
  })

  // ==========================================================================
  // SCENARIO 9: UNKNOWN_COMMIT Safely Blocking Downstream Steps
  // ==========================================================================
  it("Scenario 9: UNKNOWN_COMMIT blocking downstream steps safely", async () => {
    const questId = asQuestId("quest_unknown_commit_safe")
    const plan = createAndValidatePlan({
      questId,
      objective: "External mutation unknown commit safety",
      steps: [
        makeStep({
          id: "step_mutate",
          objective: "External mutation",
          capabilityId: "notification.send",
          arguments: { message: "Critical dispatch" },
        }),
        makeStep({
          id: "step_downstream",
          objective: "Downstream followup",
          capabilityId: "tasks.create",
          arguments: { title: "After dispatch" },
          dependsOn: ["step_mutate"],
        }),
      ],
    })

    // Record Step 1 as UNKNOWN_COMMIT in the ledger (e.g. network dropped during transmission)
    const opId = deriveQuestStepOperationId(questId, asPlanStepId("step_mutate"), asCapabilityId("notification.send"))
    ledger.claimOperation({
      capabilityId: asCapabilityId("notification.send"),
      actionClass: "EXTERNAL_SEND",
      idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
      input: { message: "Critical dispatch" },
      questId,
      stepId: asPlanStepId("step_mutate"),
      operationId: opId,
    })
    ledger.failOperation({
      operationId: opId,
      errorCode: "SOCKET_TIMEOUT",
      errorMessage: "Connection timed out during transmission",
      isRetryable: false,
      isUnknownCommit: true,
    })

    const result = await executor.executePlan(plan)
    // Step 2 is blocked because upstream step is in UNKNOWN_COMMIT
    expect(result.status).toBe("BLOCKED")
    expect(result.blockedSteps).toContain("step_downstream")
    expect(createHandler).not.toHaveBeenCalled()

    // Terminal completion verifier marks quest as BLOCKED
    const verResult = await verifier.verifyPlan(plan, result)
    expect(verResult.finalStatus).toBe("BLOCKED")
    expect(verResult.verified).toBe(false)
  })

  // ==========================================================================
  // SCENARIO 10: Direct ACTION vs QUEST Isolation
  // ==========================================================================
  it("Scenario 10: Direct ACTION vs QUEST isolation in shared ledger", async () => {
    // 1. Direct ACTION: claimed directly via TurnId & action slot
    const turnId = asTurnId("turn_direct_action_1")
    const directClaim = ledger.claimOperation({
      capabilityId: asCapabilityId("tasks.create"),
      actionClass: "LOCAL_CREATE",
      idempotencyClass: "LEDGER_REQUIRED",
      input: { title: "Direct action item" },
      actor: "user",
    })
    expect(directClaim.status).toBe("CLAIMED")
    if (directClaim.status === "CLAIMED") {
      ledger.completeOperation({ operationId: directClaim.operationId, resultPayload: { id: 10, title: "Direct action item" } })
    }

    // 2. QUEST Execution: DAG executed with questId and PlanStepId
    const questPlan = createAndValidatePlan({
      objective: "Quest task creation",
      steps: [
        makeStep({
          id: "quest_step_1",
          objective: "Quest task",
          capabilityId: "tasks.create",
          arguments: { title: "Quest action item" },
        }),
      ],
    })

    const questResult = await executor.executePlan(questPlan)
    expect(questResult.status).toBe("AWAITING_VERIFICATION")

    // Both operations coexist cleanly without key collision
    const questOpId = deriveQuestStepOperationId(
      questPlan.questId,
      asPlanStepId("quest_step_1"),
      asCapabilityId("tasks.create")
    )
    const directOp = ledger.getOperation((directClaim as any).operationId)
    const questOp = ledger.getOperation(questOpId)

    expect(directOp).toBeDefined()
    expect(questOp).toBeDefined()
    expect(directOp?.operationId).not.toBe(questOp?.operationId)
    expect(directOp?.questId).toBeUndefined()
    expect(questOp?.questId).toBe(questPlan.questId)
  })

  // ==========================================================================
  // SCENARIO 11: Multi-Domain Connector Workflow (Tasks + Research + Notifications)
  // ==========================================================================
  it("Scenario 11: Multi-domain connector workflow (Tasks + Research + Notifications)", async () => {
    const plan = createAndValidatePlan({
      objective: "Cross-domain orchestration pipeline",
      steps: [
        makeStep({
          id: "step_task",
          objective: "Create tracking task",
          capabilityId: "tasks.create",
          arguments: { title: "Market research tracking" },
        }),
        makeStep({
          id: "step_search",
          objective: "Perform web search",
          capabilityId: "research.search",
          arguments: { query: "Latest autonomous agent benchmarks" },
          dependsOn: ["step_task"],
        }),
        makeStep({
          id: "step_notify",
          objective: "Send completion alert",
          capabilityId: "notification.send",
          arguments: { message: "Research complete" },
          dependsOn: ["step_search"],
        }),
      ],
    })

    const result = await executor.executePlan(plan, {
      confirmedSteps: [asPlanStepId("step_notify")],
    })

    expect(result.status).toBe("AWAITING_VERIFICATION")
    expect(result.completedSteps).toHaveLength(3)
    expect(createHandler).toHaveBeenCalledTimes(1)
    expect(searchHandler).toHaveBeenCalledTimes(1)
    expect(notifyHandler).toHaveBeenCalledTimes(1)
  })

  // ==========================================================================
  // SCENARIO 12: Cascading Error Propagation on Unrecoverable Failure
  // ==========================================================================
  it("Scenario 12: Cascading error propagation on unrecoverable failure", async () => {
    // Step 2 fails with fatal error
    createHandler.mockRejectedValueOnce(new Error("Database write locked permanently"))

    const plan = createAndValidatePlan({
      objective: "Cascade failure test",
      steps: [
        makeStep({
          id: "step_1",
          objective: "Read tasks",
          capabilityId: "tasks.list",
        }),
        makeStep({
          id: "step_2",
          objective: "Mutate task (fails fatally)",
          capabilityId: "tasks.create",
          arguments: { title: "Fatal Task" },
          dependsOn: ["step_1"],
        }),
        makeStep({
          id: "step_3",
          objective: "Downstream step 1",
          capabilityId: "research.search",
          arguments: { query: "check" },
          dependsOn: ["step_2"],
        }),
        makeStep({
          id: "step_4",
          objective: "Downstream step 2",
          capabilityId: "tasks.list",
          dependsOn: ["step_3"],
        }),
      ],
    })

    const result = await executor.executePlan(plan)
    expect(result.status).toBe("FAILED")
    expect(result.completedSteps).toEqual(["step_1"])
    expect(result.failedSteps).toEqual(["step_2"])
    // Both Step 3 and Step 4 blocked with cascading reason
    expect(result.blockedSteps).toContain("step_3")
    expect(result.blockedSteps).toContain("step_4")

    const verResult = await verifier.verifyPlan(plan, result)
    expect(verResult.finalStatus).toBe("FAILED")
    expect(verResult.verified).toBe(false)
  })

  // ==========================================================================
  // SCENARIO 13: Optional Step Failure Permits PARTIALLY_COMPLETED Status
  // ==========================================================================
  it("Scenario 13: Optional step failure permits PARTIALLY_COMPLETED status", async () => {
    // Optional research step fails
    searchHandler.mockRejectedValueOnce(new Error("Search provider temporarily offline"))

    const plan = createAndValidatePlan({
      objective: "Plan with optional step",
      steps: [
        makeStep({
          id: "step_req",
          objective: "Required task creation",
          capabilityId: "tasks.create",
          arguments: { title: "Essential Task" },
          required: true,
        }),
        makeStep({
          id: "step_opt",
          objective: "Optional web search enrichment",
          capabilityId: "research.search",
          arguments: { query: "enrichment data" },
          required: false, // Step is explicitly optional
        }),
      ],
    })

    const execResult = await executor.executePlan(plan)
    expect(execResult.completedSteps).toContain("step_req")
    expect(execResult.failedSteps).toContain("step_opt")

    const verResult = await verifier.verifyPlan(plan, execResult)
    expect(verResult.finalStatus).toBe("PARTIALLY_COMPLETED")
    expect(verResult.verified).toBe(true)
    expect(verResult.unfulfilledRequiredSteps).toHaveLength(0)
    expect(verResult.unfulfilledOptionalSteps).toContain("step_opt")
  })

  // ==========================================================================
  // SCENARIO 14: Mid-Flight Plan Cancellation via AbortSignal
  // ==========================================================================
  it("Scenario 14: Mid-flight plan cancellation via AbortSignal", async () => {
    const controller = new AbortController()

    searchHandler.mockImplementationOnce(async () => {
      // Abort during execution of step 1
      controller.abort()
      return { count: 1 }
    })

    const plan = createAndValidatePlan({
      objective: "Cancellable execution plan",
      steps: [
        makeStep({
          id: "step_1",
          objective: "Step 1 (triggers cancel)",
          capabilityId: "research.search",
          arguments: { query: "abort test" },
        }),
        makeStep({
          id: "step_2",
          objective: "Step 2 (should not run)",
          capabilityId: "tasks.create",
          arguments: { title: "Unreachable" },
          dependsOn: ["step_1"],
        }),
      ],
    })

    const result = await executor.executePlan(plan, {
      abortSignal: controller.signal,
    })

    expect(result.status).toBe("CANCELLED")
    expect(createHandler).not.toHaveBeenCalled()
  })

  // ==========================================================================
  // SCENARIO 15: Structural Rejection of Cycles During Validation
  // ==========================================================================
  it("Scenario 15: Structural rejection of cycles during validation", () => {
    const cyclicPlan: ExecutionPlan = {
      id: asPlanId("plan_cyclic"),
      questId: asQuestId("quest_cyclic"),
      traceId: asTraceId("trace_cyclic"),
      objective: "Cycle detection test",
      version: 1,
      steps: [
        makeStep({
          id: "step_a",
          objective: "Step A",
          capabilityId: "tasks.list",
          dependsOn: ["step_c"],
        }),
        makeStep({
          id: "step_b",
          objective: "Step B",
          capabilityId: "tasks.list",
          dependsOn: ["step_a"],
        }),
        makeStep({
          id: "step_c",
          objective: "Step C",
          capabilityId: "tasks.list",
          dependsOn: ["step_b"],
        }),
      ],
      createdAt: Date.now(),
    }

    const valResult = validator.validate(cyclicPlan)
    expect(valResult.valid).toBe(false)
    if (!valResult.valid) {
      expect(valResult.issues.some((i) => i.code === "CYCLIC_DEPENDENCY")).toBe(true)
    }
  })

  // ==========================================================================
  // SCENARIO 16: Structural Rejection of Invalid Schemas and Unrouted Capabilities
  // ==========================================================================
  it("Scenario 16: Structural rejection of invalid schemas and unrouted capabilities", () => {
    // 1. Unknown / Unregistered capability
    const unknownCapPlan: ExecutionPlan = {
      id: asPlanId("plan_unknown"),
      questId: asQuestId("quest_unknown"),
      traceId: asTraceId("trace_unknown"),
      objective: "Unknown capability test",
      version: 1,
      steps: [
        makeStep({
          id: "step_1",
          objective: "Execute unknown",
          capabilityId: "dangerous.unregistered.command",
        }),
      ],
      createdAt: Date.now(),
    }

    const val1 = validator.validate(unknownCapPlan)
    expect(val1.valid).toBe(false)
    if (!val1.valid) {
      expect(val1.issues.some((i) => i.code === "UNKNOWN_CAPABILITY")).toBe(true)
    }

    // 2. Schema violation: numeric id passed as string to delete
    const invalidSchemaPlan: ExecutionPlan = {
      id: asPlanId("plan_bad_schema"),
      questId: asQuestId("quest_bad_schema"),
      traceId: asTraceId("trace_bad_schema"),
      objective: "Invalid schema test",
      version: 1,
      steps: [
        makeStep({
          id: "step_1",
          objective: "Delete task with invalid type",
          capabilityId: "tasks.delete",
          arguments: { id: "not-a-number" }, // expects number!
        }),
      ],
      createdAt: Date.now(),
    }

    const val2 = validator.validate(invalidSchemaPlan)
    expect(val2.valid).toBe(false)
    if (!val2.valid) {
      expect(val2.issues.some((i) => i.code === "INVALID_SCHEMA")).toBe(true)
    }
  })

  // ==========================================================================
  // SCENARIO 17: Forward Reference and Undeclared Dependency Rejection in $ref
  // ==========================================================================
  it("Scenario 17: Forward reference and undeclared dependency rejection in $ref", () => {
    // 1. Forward reference: step_1 tries to reference step_2's future output
    const forwardRefPlan: ExecutionPlan = {
      id: asPlanId("plan_fwd"),
      questId: asQuestId("quest_fwd"),
      traceId: asTraceId("trace_fwd"),
      objective: "Forward reference test",
      version: 1,
      steps: [
        makeStep({
          id: "step_1",
          objective: "Step 1 with forward ref",
          capabilityId: "tasks.create",
          arguments: { title: { $ref: { stepId: asPlanStepId("step_2"), path: "/title" } } },
        }),
        makeStep({
          id: "step_2",
          objective: "Step 2",
          capabilityId: "tasks.list",
        }),
      ],
      createdAt: Date.now(),
    }

    const val1 = validator.validate(forwardRefPlan)
    expect(val1.valid).toBe(false)
    if (!val1.valid) {
      expect(val1.issues.some((i) => i.code === "FUTURE_REFERENCE" || i.code === "UNDECLARED_DEPENDENCY_REFERENCE")).toBe(true)
    }

    // 2. Undeclared dependency: step_2 references step_1 output without step_1 in dependsOn
    const undeclaredDepPlan: ExecutionPlan = {
      id: asPlanId("plan_undec"),
      questId: asQuestId("quest_undec"),
      traceId: asTraceId("trace_undec"),
      objective: "Undeclared dependency test",
      version: 1,
      steps: [
        makeStep({
          id: "step_1",
          objective: "Step 1",
          capabilityId: "tasks.list",
        }),
        makeStep({
          id: "step_2",
          objective: "Step 2 undeclared ref",
          capabilityId: "tasks.create",
          arguments: { title: { $ref: { stepId: asPlanStepId("step_1"), path: "/title" } } },
          dependsOn: [], // missing step_1!
        }),
      ],
      createdAt: Date.now(),
    }

    const val2 = validator.validate(undeclaredDepPlan)
    expect(val2.valid).toBe(false)
    if (!val2.valid) {
      expect(val2.issues.some((i) => i.code === "UNDECLARED_DEPENDENCY_REFERENCE")).toBe(true)
    }
  })

  // ==========================================================================
  // SCENARIO 18: Prototype Pollution and Unsafe Path Guard in $ref
  // ==========================================================================
  it("Scenario 18: Prototype pollution and unsafe path guard in $ref", () => {
    const maliciousPlan: ExecutionPlan = {
      id: asPlanId("plan_proto"),
      questId: asQuestId("quest_proto"),
      traceId: asTraceId("trace_proto"),
      objective: "Prototype pollution test",
      version: 1,
      steps: [
        makeStep({
          id: "step_1",
          objective: "Normal step",
          capabilityId: "tasks.list",
        }),
        makeStep({
          id: "step_2",
          objective: "Pollution attempt",
          capabilityId: "tasks.create",
          arguments: {
            title: { $ref: { stepId: asPlanStepId("step_1"), path: "/__proto__/polluted" } },
          },
          dependsOn: ["step_1"],
        }),
      ],
      createdAt: Date.now(),
    }

    const valResult = validator.validate(maliciousPlan)
    expect(valResult.valid).toBe(false)
    if (!valResult.valid) {
      expect(valResult.issues.some((i) => i.code === "INVALID_REFERENCE")).toBe(true)
    }
  })

  // ==========================================================================
  // SCENARIO 19: Plan Complexity Bound Limits Enforcement
  // ==========================================================================
  it("Scenario 19: Plan complexity bound limits enforcement", () => {
    // Exceeds max steps limit (> 10)
    const tooManySteps: PlannerStep[] = Array.from({ length: 11 }, (_, i) =>
      makeStep({
        id: `step_${i}`,
        objective: `Step ${i}`,
        capabilityId: "tasks.list",
        dependsOn: i === 0 ? [] : [`step_${i - 1}`],
      })
    )

    const largePlan: ExecutionPlan = {
      id: asPlanId("plan_too_many"),
      questId: asQuestId("quest_too_many"),
      traceId: asTraceId("trace_too_many"),
      objective: "Step count limit test",
      version: 1,
      steps: tooManySteps,
      createdAt: Date.now(),
    }

    const valResult = validator.validate(largePlan)
    expect(valResult.valid).toBe(false)
    if (!valResult.valid) {
      expect(valResult.issues.some((i) => i.code === "PLAN_TOO_LARGE")).toBe(true)
    }
  })

  // ==========================================================================
  // SCENARIO 20: 25-Run Concurrent Stress Test (0 Race Conditions, 0 Deadlocks)
  // ==========================================================================
  it("Scenario 20: 25-run concurrent stress test (0 race conditions, 0 deadlocks)", async () => {
    const runs = 25
    const concurrentPlans: ValidatedExecutionPlan[] = []

    for (let i = 0; i < runs; i++) {
      concurrentPlans.push(
        createAndValidatePlan({
          planId: `stress_plan_${i}`,
          questId: `stress_quest_${i}`,
          objective: `Concurrent stress execution run ${i}`,
          steps: [
            makeStep({
              id: "read_step",
              objective: `Concurrent read ${i}`,
              capabilityId: "research.search",
              arguments: { query: `stress-${i}` },
            }),
            makeStep({
              id: "create_step",
              objective: `Concurrent create ${i}`,
              capabilityId: "tasks.create",
              arguments: { title: `Stress Task ${i}` },
              dependsOn: ["read_step"],
            }),
          ],
        })
      )
    }

    // Execute all 25 plans concurrently
    const results = await Promise.all(
      concurrentPlans.map((plan) => executor.executePlan(plan, { maxConcurrentReads: 4 }))
    )

    // Assert every single execution completed without errors or deadlocks
    for (const res of results) {
      expect(res.status).toBe("AWAITING_VERIFICATION")
      expect(res.completedSteps).toEqual(["read_step", "create_step"])
      expect(res.failedSteps).toHaveLength(0)
      expect(res.blockedSteps).toHaveLength(0)
    }

    // Verify all 25 completed plans in TerminalCompletionVerifier
    const verificationResults = await Promise.all(
      concurrentPlans.map((plan, idx) => verifier.verifyPlan(plan, results[idx]))
    )

    for (const vRes of verificationResults) {
      expect(vRes.finalStatus).toBe("COMPLETED")
      expect(vRes.verified).toBe(true)
    }

    // 25 distinct quests cleanly recorded in Operation Ledger without collisions
    const totalOps = ledger.pruneOldOperations(0)
    expect(totalOps).toBe(50) // 25 plans * 2 steps = 50 distinct operations
  })
})
