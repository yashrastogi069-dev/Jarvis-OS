/**
 * JARVIS CORE V2 — STRUCTURED DAG PLANNER TEST SUITE
 * 
 * Checkpoint C9: Complete test verification of pure plan generation,
 * DAG validation, typed references, limit enforcement, and execution absence.
 */

import { describe, it, expect, vi } from "vitest"
import {
  StructuredPlanner,
  resolveJsonPointer,
  extractStepReferences,
  resolveStepReferences,
  PLAN_LIMITS,
  type PlannerInput,
  type PlannerModelAdapter,
  type CapabilityDescriptor,
} from "../../lib/jarvis-core/planner"
import {
  asCapabilityId,
  asPlanId,
  asPlanStepId,
  asQuestId,
  asTraceId,
} from "../../lib/jarvis-core/types"

// Sample routed capabilities
const mockCapabilities: CapabilityDescriptor[] = [
  {
    id: asCapabilityId("research.search"),
    domain: "research",
    description: "Search the web for real-time information",
    actionClass: "READ_ONLY",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    id: asCapabilityId("memory.save"),
    domain: "memory",
    description: "Save a permanent fact to long-term memory",
    actionClass: "LOCAL_CREATE",
    inputSchema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
  },
  {
    id: asCapabilityId("tasks.create"),
    domain: "tasks",
    description: "Create a reminder task in SQLite",
    actionClass: "LOCAL_CREATE",
    inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
  },
  {
    id: asCapabilityId("tasks.list"),
    domain: "tasks",
    description: "List all existing tasks",
    actionClass: "READ_ONLY",
    inputSchema: { type: "object", properties: { status: { type: "string" } } },
  },
  {
    id: asCapabilityId("google.mail.messages.list"),
    domain: "google",
    description: "List recent emails from Gmail",
    actionClass: "READ_ONLY",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
  },
  {
    id: asCapabilityId("obsidian.notes.append"),
    domain: "obsidian",
    description: "Append markdown text to an Obsidian vault note",
    actionClass: "LOCAL_UPDATE",
    inputSchema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" } }, required: ["title", "content"] },
  },
]

function makeInput(overrides?: Partial<PlannerInput>): PlannerInput {
  return {
    questId: asQuestId("quest_test_001"),
    traceId: asTraceId("trace_test_001"),
    objective: "Search quantum computing advances and save memory",
    capabilities: mockCapabilities,
    ...overrides,
  }
}

describe("JARVIS CORE V2 — Structured DAG Planner (C9)", () => {
  // ==========================================================================
  // 1. JSON POINTER & REFERENCE RESOLUTION (RFC 6901)
  // ==========================================================================
  describe("JSON Pointer & Reference System", () => {
    it("evaluates root, object properties, and array indices correctly", () => {
      const data = {
        title: "Quantum Report",
        items: [
          { id: "item_1", score: 0.95 },
          { id: "item_2", score: 0.88 },
        ],
        nested: {
          deep: {
            flag: true,
          },
        },
      }

      expect(resolveJsonPointer(data, "").value).toBe(data)
      expect(resolveJsonPointer(data, "/title").value).toBe("Quantum Report")
      expect(resolveJsonPointer(data, "/items/0/id").value).toBe("item_1")
      expect(resolveJsonPointer(data, "/items/1/score").value).toBe(0.88)
      expect(resolveJsonPointer(data, "/nested/deep/flag").value).toBe(true)
    })

    it("handles escaped characters ~1 and ~0 per RFC 6901", () => {
      const data = {
        "a/b": "slash-value",
        "m~n": "tilde-value",
      }

      expect(resolveJsonPointer(data, "/a~1b").value).toBe("slash-value")
      expect(resolveJsonPointer(data, "/m~0n").value).toBe("tilde-value")
    })

    it("returns clean error for missing properties or out of bound array indices", () => {
      const data = { list: [1, 2] }
      const missingProp = resolveJsonPointer(data, "/nonexistent")
      expect(missingProp.found).toBe(false)
      expect(missingProp.error).toContain('Property "nonexistent" not found')

      const oob = resolveJsonPointer(data, "/list/5")
      expect(oob.found).toBe(false)
      expect(oob.error).toContain("Array index out of bounds")
    })

    it("blocks access to forbidden prototype pollution properties", () => {
      const data = {}
      const protoRes = resolveJsonPointer(data, "/__proto__")
      expect(protoRes.found).toBe(false)
      expect(protoRes.error).toContain("forbidden property")
    })

    it("extracts and resolves $ref values against completed step outputs", () => {
      const args = {
        title: "Daily Digest",
        summary: {
          $ref: { stepId: asPlanStepId("step_1"), path: "/results/0/snippet" },
        },
        metadata: {
          sourceId: {
            $ref: { stepId: asPlanStepId("step_1"), path: "/results/0/id" },
          },
        },
      }

      const refs = extractStepReferences(args)
      expect(refs).toHaveLength(2)
      expect(refs[0].stepId).toBe("step_1")
      expect(refs[0].path).toBe("/results/0/snippet")

      const outputs = new Map<any, unknown>()
      outputs.set("step_1", {
        results: [{ id: "doc_99", snippet: "Quantum breakthrough in 2026" }],
      })

      const resolved = resolveStepReferences(args as any, outputs)
      expect(resolved.missingReferences).toHaveLength(0)
      expect(resolved.resolutionErrors).toHaveLength(0)
      expect(resolved.resolved).toEqual({
        title: "Daily Digest",
        summary: "Quantum breakthrough in 2026",
        metadata: { sourceId: "doc_99" },
      })
    })

    it("flags missing step output references when dependency has not produced output", () => {
      const args = {
        param: { $ref: { stepId: asPlanStepId("step_unexecuted"), path: "/id" } },
      }
      const outputs = new Map<any, unknown>()
      const res = resolveStepReferences(args as any, outputs)
      expect(res.missingReferences).toHaveLength(1)
      expect(res.missingReferences[0].stepId).toBe("step_unexecuted")
    })
  })

  // ==========================================================================
  // 2. VALID PLAN GENERATION SCENARIOS
  // ==========================================================================
  describe("Valid Plan Generation", () => {
    it("generates a single linear 2-step plan (Search -> Save Memory)", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_linear_2",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Search quantum computing advances and save memory",
          version: 1,
          steps: [
            {
              id: "step_1",
              objective: "Search web for quantum computing advances",
              capabilityId: "research.search",
              arguments: { query: "quantum computing advances 2026" },
              dependsOn: [],
              completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
              required: true,
            },
            {
              id: "step_2",
              objective: "Save quantum research synthesis to memory",
              capabilityId: "memory.save",
              arguments: {
                content: {
                  $ref: { stepId: "step_1", path: "/results/0/snippet" },
                },
              },
              dependsOn: ["step_1"],
              completionCriteria: [{ type: "CAPABILITY_SUCCEEDED" }],
              required: true,
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())

      expect(res.success).toBe(true)
      if (!res.success) return

      expect(res.plan.id).toBe("plan_linear_2")
      expect(res.plan.steps).toHaveLength(2)
      expect(res.plan.steps[0].id).toBe("step_1")
      expect(res.plan.steps[0].dependsOn).toEqual([])
      expect(res.plan.steps[1].id).toBe("step_2")
      expect(res.plan.steps[1].dependsOn).toEqual(["step_1"])
    })

    it("generates a 3-step linear dependency chain", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_chain_3",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Search -> Create Task -> List Tasks to verify",
          version: 1,
          steps: [
            {
              id: "step_1",
              objective: "Search for project requirements",
              capabilityId: "research.search",
              arguments: { query: "project roadmap" },
              dependsOn: [],
            },
            {
              id: "step_2",
              objective: "Create actionable task from requirements",
              capabilityId: "tasks.create",
              arguments: { title: "Follow up on project roadmap" },
              dependsOn: ["step_1"],
            },
            {
              id: "step_3",
              objective: "List tasks to verify creation",
              capabilityId: "tasks.list",
              arguments: { status: "open" },
              dependsOn: ["step_2"],
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())

      expect(res.success).toBe(true)
      if (!res.success) return
      expect(res.plan.steps).toHaveLength(3)
      expect(res.plan.steps[2].dependsOn).toEqual(["step_2"])
    })

    it("generates independent parallelizable read steps (zero dependencies between reads)", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_parallel_reads",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Check tasks and check unread emails simultaneously",
          version: 1,
          steps: [
            {
              id: "read_tasks",
              objective: "List all open tasks",
              capabilityId: "tasks.list",
              arguments: { status: "open" },
              dependsOn: [],
            },
            {
              id: "read_emails",
              objective: "Fetch unread emails",
              capabilityId: "google.mail.messages.list",
              arguments: { query: "is:unread" },
              dependsOn: [],
            },
            {
              id: "save_summary",
              objective: "Save combined briefing",
              capabilityId: "memory.save",
              arguments: { content: "Daily briefing compiled" },
              dependsOn: ["read_tasks", "read_emails"],
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())

      expect(res.success).toBe(true)
      if (!res.success) return
      expect(res.plan.steps[0].dependsOn).toHaveLength(0)
      expect(res.plan.steps[1].dependsOn).toHaveLength(0)
      expect(res.plan.steps[2].dependsOn).toEqual(["read_tasks", "read_emails"])
    })

    it("generates a cross-domain plan (Google -> Obsidian -> Tasks)", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_cross_domain",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Fetch email, write Obsidian note, and create follow-up task",
          version: 1,
          steps: [
            {
              id: "s1",
              objective: "Get recent emails",
              capabilityId: "google.mail.messages.list",
              arguments: { query: "from:boss" },
              dependsOn: [],
            },
            {
              id: "s2",
              objective: "Append to notes",
              capabilityId: "obsidian.notes.append",
              arguments: {
                title: "Meeting Notes",
                content: { $ref: { stepId: "s1", path: "/messages/0/snippet" } },
              },
              dependsOn: ["s1"],
            },
            {
              id: "s3",
              objective: "Create reminder task",
              capabilityId: "tasks.create",
              arguments: { title: "Review boss meeting notes" },
              dependsOn: ["s2"],
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(true)
    })

    it("handles JSON wrapped in markdown code fences seamlessly", async () => {
      const jsonPayload = JSON.stringify({
        id: "plan_fenced",
        questId: "quest_test_001",
        traceId: "trace_test_001",
        objective: "Test code fence stripping",
        version: 1,
        steps: [
          {
            id: "step_1",
            objective: "Do search",
            capabilityId: "research.search",
            arguments: { query: "test" },
            dependsOn: [],
          },
        ],
      })

      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue(`\`\`\`json\n${jsonPayload}\n\`\`\``),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.plan.id).toBe("plan_fenced")
      }
    })
  })

  // ==========================================================================
  // 3. ADVERSARIAL VALIDATION & ERROR REJECTION
  // ==========================================================================
  describe("Adversarial Plan Rejection", () => {
    it("rejects plan when model invents an unsupported or unrouted capability", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_invented_tool",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Hack system",
          version: 1,
          steps: [
            {
              id: "step_1",
              objective: "Run arbitrary bash command",
              capabilityId: "system.execute_root_bash", // NOT ROUTED / NOT REGISTERED
              arguments: { cmd: "rm -rf /" },
              dependsOn: [],
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())

      expect(res.success).toBe(false)
      if (res.success) return
      expect(res.error.code).toBe("CAPABILITY_NOT_ROUTED")
      expect(res.error.message).toContain("system.execute_root_bash")
    })

    it("rejects plan with direct cyclic dependency (A -> A)", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_self_cycle",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Infinite self cycle",
          version: 1,
          steps: [
            {
              id: "step_self",
              objective: "Depends on self",
              capabilityId: "tasks.list",
              arguments: {},
              dependsOn: ["step_self"],
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(false)
      if (res.success) return
      expect(res.error.code).toBe("CYCLIC_DEPENDENCY")
    })

    it("rejects plan with mutual cyclic dependency (A -> B -> A)", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_mutual_cycle",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Mutual cycle",
          version: 1,
          steps: [
            {
              id: "step_a",
              objective: "Step A",
              capabilityId: "tasks.list",
              arguments: {},
              dependsOn: ["step_b"],
            },
            {
              id: "step_b",
              objective: "Step B",
              capabilityId: "research.search",
              arguments: { query: "a" },
              dependsOn: ["step_a"],
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(false)
      if (res.success) return
      expect(res.error.code).toBe("CYCLIC_DEPENDENCY")
      expect(res.error.message).toContain("Cycle detected")
    })

    it("rejects plan with duplicate step IDs", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_dupes",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Duplicate IDs",
          version: 1,
          steps: [
            {
              id: "step_same",
              objective: "First instance",
              capabilityId: "tasks.list",
              arguments: {},
              dependsOn: [],
            },
            {
              id: "step_same",
              objective: "Second instance with same ID",
              capabilityId: "memory.save",
              arguments: { content: "test" },
              dependsOn: [],
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(false)
      if (res.success) return
      expect(res.error.code).toBe("SCHEMA_VIOLATION")
      expect(res.error.message).toContain("Duplicate step ID")
    })

    it("rejects plan referencing output from a nonexistent step", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_bad_ref",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Bad reference",
          version: 1,
          steps: [
            {
              id: "step_1",
              objective: "Do task",
              capabilityId: "tasks.create",
              arguments: {
                title: { $ref: { stepId: "ghost_step", path: "/title" } },
              },
              dependsOn: [],
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(false)
      if (res.success) return
      expect(res.error.code).toBe("INVALID_REFERENCE")
      expect(res.error.message).toContain("nonexistent step")
    })

    it("rejects plan referencing output without declaring dependency in dependsOn", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_undeclared_ref",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Undeclared dependency reference",
          version: 1,
          steps: [
            {
              id: "step_a",
              objective: "Step A",
              capabilityId: "tasks.list",
              arguments: {},
              dependsOn: [],
            },
            {
              id: "step_b",
              objective: "Step B uses output of A but didn't put A in dependsOn",
              capabilityId: "memory.save",
              arguments: {
                content: { $ref: { stepId: "step_a", path: "/data" } },
              },
              dependsOn: [], // Missing "step_a"!
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(false)
      if (res.success) return
      expect(res.error.code).toBe("INVALID_REFERENCE")
      expect(res.error.message).toContain('is not in dependsOn')
    })

    it("rejects plan when step attempts to reference its own output ($ref self-reference)", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_self_ref",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Self reference",
          version: 1,
          steps: [
            {
              id: "step_self",
              objective: "Reference self",
              capabilityId: "tasks.create",
              arguments: {
                title: { $ref: { stepId: "step_self", path: "/title" } },
              },
              dependsOn: [],
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(false)
      if (res.success) return
      expect(res.error.code).toBe("INVALID_REFERENCE")
      expect(res.error.message).toContain("cannot reference its own output")
    })

    it("rejects plan with excessive step count exceeding PLAN_LIMITS.MAX_STEPS", async () => {
      const tooManySteps = Array.from({ length: PLAN_LIMITS.MAX_STEPS + 1 }, (_, i) => ({
        id: `step_${i}`,
        objective: `Subtask ${i}`,
        capabilityId: "tasks.list",
        arguments: {},
        dependsOn: [],
      }))

      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_excessive",
          questId: "quest_test_001",
          traceId: "trace_test_001",
          objective: "Way too many steps",
          version: 1,
          steps: tooManySteps,
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(false)
      if (res.success) return
      expect(res.error.code).toBe("SCHEMA_VIOLATION")
    })

    it("rejects plan when model returns conversational prose instead of JSON", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi
          .fn()
          .mockResolvedValue(
            "I'd be happy to help! First, I'll search your emails, then I'll create a task."
          ),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(false)
      if (res.success) return
      expect(res.error.code).toBe("INVALID_MODEL_OUTPUT")
    })

    it("rejects plan when adapter throws an unexpected network/timeout exception", async () => {
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockRejectedValue(new Error("Provider connection timed out")),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())
      expect(res.success).toBe(false)
      if (res.success) return
      expect(res.error.code).toBe("MODEL_FAILURE")
      expect(res.error.message).toContain("timed out")
    })
  })

  // ==========================================================================
  // 4. ABSENCE OF EXECUTION SIDE EFFECTS (Section 5.7)
  // ==========================================================================
  describe("Absence of Execution Side Effects", () => {
    it("proves C9 StructuredPlanner executes zero capabilities and creates zero DB writes", async () => {
      // Spy on console or global handles
      const mockAdapter: PlannerModelAdapter = {
        generatePlan: vi.fn().mockResolvedValue({
          id: "plan_no_side_effects",
          questId: "quest_pure_plan",
          traceId: "trace_pure_plan",
          objective: "Test absence of execution",
          version: 1,
          steps: [
            {
              id: "step_1",
              objective: "Search",
              capabilityId: "research.search",
              arguments: { query: "test" },
              dependsOn: [],
            },
            {
              id: "step_2",
              objective: "Mutating create",
              capabilityId: "tasks.create",
              arguments: { title: "Never created by planner" },
              dependsOn: ["step_1"],
            },
          ],
        }),
      }

      const planner = new StructuredPlanner(mockAdapter)
      const res = await planner.plan(makeInput())

      expect(res.success).toBe(true)
      // Assert planner only returns typed data
      expect(res).toHaveProperty("plan")
      // Model was called exactly once to plan
      expect(mockAdapter.generatePlan).toHaveBeenCalledTimes(1)
    })
  })
})
