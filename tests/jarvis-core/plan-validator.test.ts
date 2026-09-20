/**
 * JARVIS CORE V2 — DETERMINISTIC PLAN VALIDATOR TEST SUITE
 * 
 * Checkpoint C10: Adversarial validation, graph invariants, cycle rejection,
 * schema enforcement, and trusted safety metadata derivation.
 */

import { describe, it, expect } from "vitest"
import {
  DeterministicPlanValidator,
  PLAN_LIMITS,
  type ValidatedExecutionPlan,
} from "../../lib/jarvis-core/planner"
import {
  capabilityRegistry,
  CapabilityRegistry,
} from "../../lib/jarvis-core/capabilities/registry"
import { ALL_CAPABILITIES } from "../../lib/jarvis-core/capabilities/definitions"
import { z } from "zod"
import {
  asPlanId,
  asPlanStepId,
  asQuestId,
  asTraceId,
  asCapabilityId,
} from "../../lib/jarvis-core/types"
import type { ExecutionPlan } from "../../lib/jarvis-core/planner/types"

function makeBasePlan(steps: ExecutionPlan["steps"] = []): ExecutionPlan {
  return {
    id: asPlanId("plan_val_test_001"),
    questId: asQuestId("quest_val_test_001"),
    traceId: asTraceId("trace_val_test_001"),
    objective: "Test plan objective",
    version: 1,
    steps,
    createdAt: Date.now(),
  }
}

describe("JARVIS CORE V2 — Deterministic Plan Validator (C10)", () => {
  const validator = new DeterministicPlanValidator(capabilityRegistry)

  // ==========================================================================
  // 1. VALID PLAN ACCEPTANCE & TRUSTED METADATA DERIVATION
  // ==========================================================================
  describe("Valid Plan Acceptance & Trusted Metadata", () => {
    it("validates a multi-step plan and derives trusted safety metadata from registry", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_search"),
          objective: "Search for updates",
          capabilityId: asCapabilityId("research.search"),
          arguments: { query: "AI progress 2026" },
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
        {
          id: asPlanStepId("step_save"),
          objective: "Save result to memory",
          capabilityId: asCapabilityId("memory.save"),
          arguments: {
            content: {
              $ref: { stepId: asPlanStepId("step_search"), path: "/results/0/snippet" },
            },
          },
          dependsOn: [asPlanStepId("step_search")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(true)
      if (!res.valid) return

      expect(res.plan.steps).toHaveLength(2)
      expect(res.plan.topologicalOrder).toEqual(["step_search", "step_save"])

      // Step 1: Read-only
      const step1 = res.plan.steps[0]
      expect(step1.trustedMetadata.actionClass).toBe("READ_ONLY")
      expect(step1.trustedMetadata.requiresConfirmation).toBe(false)
      expect(step1.trustedMetadata.domain).toBe("research")

      // Step 2: Local mutation
      const step2 = res.plan.steps[1]
      expect(step2.trustedMetadata.actionClass).toBe("LOCAL_CREATE")
      expect(step2.trustedMetadata.idempotencyClass).toBe("LEDGER_REQUIRED")
      expect(step2.trustedMetadata.domain).toBe("memory")
    })

    it("normalizes duplicate dependencies safely with warning", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_1"),
          objective: "Step 1",
          capabilityId: asCapabilityId("tasks.list"),
          arguments: { status: "open" },
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
        {
          id: asPlanStepId("step_2"),
          objective: "Step 2",
          capabilityId: asCapabilityId("tasks.create"),
          arguments: { title: "New Task" },
          dependsOn: [asPlanStepId("step_1"), asPlanStepId("step_1")], // DUPLICATE
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(true)
      if (!res.valid) return
      expect(res.warnings).toBeDefined()
      expect(res.warnings![0]).toContain("duplicate dependencies")
    })
  })

  // ==========================================================================
  // 2. TRUSTED SAFETY OVERRIDE (MODEL ZERO AUTHORITY)
  // ==========================================================================
  describe("Zero Model Authority Over Safety", () => {
    it("enforces confirmation for destructive delete and external send regardless of model arguments", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_delete"),
          objective: "Delete task",
          capabilityId: asCapabilityId("tasks.delete"),
          arguments: { id: 42 },
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
        {
          id: asPlanStepId("step_send"),
          objective: "Send outbound email",
          capabilityId: asCapabilityId("google.mail.message.send"),
          arguments: { to: "partner@example.com", subject: "Deal", body: "Agreed" },
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(true)
      if (!res.valid) return

      // Both steps must be flagged as requiring confirmation by the trusted runtime
      expect(res.plan.steps[0].trustedMetadata.requiresConfirmation).toBe(true)
      expect(res.plan.steps[0].trustedMetadata.actionClass).toBe("LOCAL_DELETE")

      expect(res.plan.steps[1].trustedMetadata.requiresConfirmation).toBe(true)
      expect(res.plan.steps[1].trustedMetadata.actionClass).toBe("EXTERNAL_SEND")
    })
  })

  // ==========================================================================
  // 3. CAPABILITY VALIDATION & REJECTION
  // ==========================================================================
  describe("Capability Validation", () => {
    it("rejects unknown or invented capability IDs", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_1"),
          objective: "Execute arbitrary bash",
          capabilityId: asCapabilityId("system.root_bash"),
          arguments: {},
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("UNKNOWN_CAPABILITY")
      expect(res.issues[0].message).toContain("unregistered capability")
    })

    it("rejects internal engine capabilities that are not user-facing", () => {
      const internalRegistry = new CapabilityRegistry([
        ...ALL_CAPABILITIES,
        {
          id: asCapabilityId("engine.internal_cleanup"),
          legacyToolName: "internalCleanup",
          domain: "tasks",
          title: "Internal Engine Cleanup",
          description: "Internal engine capability not for users",
          inputSchema: z.object({ id: z.string() }),
          handler: async () => ({ cleaned: true }),
          actionClass: "LOCAL_DELETE",
          confirmation: { defaultPolicy: "REQUIRED", criticality: "HIGH" },
          idempotency: { idempotencyClass: "NATURALLY_IDEMPOTENT" },
          requirements: {},
          availability: { staticState: "AVAILABLE", isLocallyConfigured: () => ({ available: true }) },
          routing: {},
          userFacing: false,
        },
      ])
      const internalValidator = new DeterministicPlanValidator(internalRegistry)
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_1"),
          objective: "Run internal cleanup",
          capabilityId: asCapabilityId("engine.internal_cleanup"),
          arguments: { id: "clean_1" },
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = internalValidator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("CAPABILITY_NOT_USER_FACING")
      expect(res.issues[0].message).toContain("not permitted in user plans")
    })

    it("rejects capabilities not in the C7 routed capability set when options are provided", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_1"),
          objective: "List tasks",
          capabilityId: asCapabilityId("tasks.list"),
          arguments: { status: "open" },
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      // Route only memory, but plan tries tasks
      const routed = new Set(["memory.save", "memory.recall"])
      const res = validator.validate(plan, { routedCapabilityIds: routed })

      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("UNKNOWN_CAPABILITY")
      expect(res.issues[0].message).toContain("not routed by CapabilityRouter")
    })
  })

  // ==========================================================================
  // 4. SCHEMA VALIDATION FOR LITERAL ARGUMENTS
  // ==========================================================================
  describe("Input Argument Schema Validation", () => {
    it("rejects literal arguments that violate the capability's Zod input schema", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_bad_schema"),
          objective: "Create task without required title",
          capabilityId: asCapabilityId("tasks.create"),
          arguments: { wrongField: 123 }, // Missing required 'title' string!
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("INVALID_SCHEMA")
      expect(res.issues[0].message).toContain("literal arguments fail input schema validation")
    })

    it("accepts valid literal arguments matching capability input schema", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_good_schema"),
          objective: "Create task with valid title",
          capabilityId: asCapabilityId("tasks.create"),
          arguments: { title: "Complete project documentation" },
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(true)
    })
  })

  // ==========================================================================
  // 5. GRAPH DAG INVARIANTS & CYCLE DETECTION
  // ==========================================================================
  describe("Graph DAG Invariants & Cycles", () => {
    it("rejects direct self-dependency (A -> A)", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_a"),
          objective: "Self loop",
          capabilityId: asCapabilityId("tasks.list"),
          arguments: {},
          dependsOn: [asPlanStepId("step_a")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("SELF_DEPENDENCY")
    })

    it("rejects mutual 2-node cycle (A -> B -> A)", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_a"),
          objective: "Step A",
          capabilityId: asCapabilityId("tasks.list"),
          arguments: {},
          dependsOn: [asPlanStepId("step_b")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
        {
          id: asPlanStepId("step_b"),
          objective: "Step B",
          capabilityId: asCapabilityId("research.search"),
          arguments: { query: "test" },
          dependsOn: [asPlanStepId("step_a")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues.some((i) => i.code === "CYCLIC_DEPENDENCY")).toBe(true)
    })

    it("rejects deep 4-node cycle (A -> B -> C -> D -> A)", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_a"),
          objective: "Step A",
          capabilityId: asCapabilityId("tasks.list"),
          arguments: {},
          dependsOn: [asPlanStepId("step_d")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
        {
          id: asPlanStepId("step_b"),
          objective: "Step B",
          capabilityId: asCapabilityId("research.search"),
          arguments: { query: "b" },
          dependsOn: [asPlanStepId("step_a")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
        {
          id: asPlanStepId("step_c"),
          objective: "Step C",
          capabilityId: asCapabilityId("research.search"),
          arguments: { query: "c" },
          dependsOn: [asPlanStepId("step_b")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
        {
          id: asPlanStepId("step_d"),
          objective: "Step D",
          capabilityId: asCapabilityId("tasks.create"),
          arguments: { title: "d" },
          dependsOn: [asPlanStepId("step_c")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues.some((i) => i.code === "CYCLIC_DEPENDENCY")).toBe(true)
    })

    it("rejects unknown dependency step IDs", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_1"),
          objective: "Step 1",
          capabilityId: asCapabilityId("tasks.list"),
          arguments: {},
          dependsOn: [asPlanStepId("step_ghost_404")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("UNKNOWN_DEPENDENCY")
      expect(res.issues[0].message).toContain("step_ghost_404")
    })
  })

  // ==========================================================================
  // 6. TYPED STEP REFERENCE VALIDATION
  // ==========================================================================
  describe("Step Output Reference Validation", () => {
    it("rejects references to nonexistent steps", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_1"),
          objective: "Save memory",
          capabilityId: asCapabilityId("memory.save"),
          arguments: {
            content: { $ref: { stepId: asPlanStepId("nonexistent_step"), path: "/data" } },
          },
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("INVALID_REFERENCE")
      expect(res.issues[0].message).toContain("nonexistent step")
    })

    it("rejects step attempting to reference its own output ($ref self-reference)", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_self"),
          objective: "Self reference",
          capabilityId: asCapabilityId("tasks.create"),
          arguments: {
            title: { $ref: { stepId: asPlanStepId("step_self"), path: "/title" } },
          },
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("SELF_REFERENCE")
    })

    it("rejects reference when prerequisite step is not declared in dependsOn", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_a"),
          objective: "Step A",
          capabilityId: asCapabilityId("tasks.list"),
          arguments: {},
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
        {
          id: asPlanStepId("step_b"),
          objective: "Step B uses output of A but omitted A from dependsOn",
          capabilityId: asCapabilityId("memory.save"),
          arguments: {
            content: { $ref: { stepId: asPlanStepId("step_a"), path: "/data" } },
          },
          dependsOn: [], // Omitted step_a!
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("UNDECLARED_DEPENDENCY_REFERENCE")
      expect(res.issues[0].message).toContain("is not declared in dependsOn")
    })

    it("rejects malformed JSON pointer that does not start with /", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_a"),
          objective: "Step A",
          capabilityId: asCapabilityId("tasks.list"),
          arguments: {},
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
        {
          id: asPlanStepId("step_b"),
          objective: "Step B",
          capabilityId: asCapabilityId("memory.save"),
          arguments: {
            content: { $ref: { stepId: asPlanStepId("step_a"), path: "bad_pointer_no_slash" } },
          },
          dependsOn: [asPlanStepId("step_a")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("INVALID_REFERENCE")
      expect(res.issues[0].message).toContain('must start with "/"')
    })

    it("rejects prototype pollution paths in JSON pointer", () => {
      const plan = makeBasePlan([
        {
          id: asPlanStepId("step_a"),
          objective: "Step A",
          capabilityId: asCapabilityId("tasks.list"),
          arguments: {},
          dependsOn: [],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
        {
          id: asPlanStepId("step_b"),
          objective: "Step B",
          capabilityId: asCapabilityId("memory.save"),
          arguments: {
            content: { $ref: { stepId: asPlanStepId("step_a"), path: "/__proto__/admin" } },
          },
          dependsOn: [asPlanStepId("step_a")],
          completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
          required: true,
        },
      ])

      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("INVALID_REFERENCE")
      expect(res.issues[0].message).toContain("forbidden property")
    })
  })

  // ==========================================================================
  // 7. GRAPH LIMITS & BOUNDS ENFORCEMENT
  // ==========================================================================
  describe("Plan Graph Bounds", () => {
    it("rejects plan exceeding MAX_STEPS", () => {
      const tooManySteps = Array.from({ length: PLAN_LIMITS.MAX_STEPS + 1 }, (_, i) => ({
        id: asPlanStepId(`step_${i}`),
        objective: `Subtask ${i}`,
        capabilityId: asCapabilityId("tasks.list"),
        arguments: {},
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" as const }],
        required: true,
      }))

      const plan = makeBasePlan(tooManySteps)
      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues[0].code).toBe("PLAN_TOO_LARGE")
      expect(res.issues[0].message).toContain("exceeding maximum limit")
    })

    it("rejects plan with excessive fan-out exceeding limit", () => {
      // 1 root node with 6 dependent nodes (limit is 5)
      const rootStep = {
        id: asPlanStepId("root_step"),
        objective: "Root search",
        capabilityId: asCapabilityId("research.search"),
        arguments: { query: "test" },
        dependsOn: [],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" as const }],
        required: true,
      }

      const dependents = Array.from({ length: PLAN_LIMITS.MAX_FAN_OUT + 1 }, (_, i) => ({
        id: asPlanStepId(`dep_${i}`),
        objective: `Fan out task ${i}`,
        capabilityId: asCapabilityId("tasks.create"),
        arguments: { title: `Task ${i}` },
        dependsOn: [asPlanStepId("root_step")],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" as const }],
        required: true,
      }))

      const plan = makeBasePlan([rootStep, ...dependents])
      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues.some((i) => i.code === "EXCESSIVE_FAN_OUT")).toBe(true)
    })

    it("rejects plan with excessive depth exceeding limit", () => {
      // Linear chain of 7 steps (depth 7 exceeds MAX_DEPTH 5)
      const steps = Array.from({ length: PLAN_LIMITS.MAX_DEPTH + 2 }, (_, i) => ({
        id: asPlanStepId(`chain_${i}`),
        objective: `Depth step ${i}`,
        capabilityId: asCapabilityId("tasks.list"),
        arguments: {},
        dependsOn: i === 0 ? [] : [asPlanStepId(`chain_${i - 1}`)],
        completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" as const }],
        required: true,
      }))

      const plan = makeBasePlan(steps)
      const res = validator.validate(plan)
      expect(res.valid).toBe(false)
      if (res.valid) return
      expect(res.issues.some((i) => i.code === "EXCESSIVE_DEPTH")).toBe(true)
    })
  })
})
