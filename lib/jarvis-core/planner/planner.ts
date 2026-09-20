/**
 * JARVIS CORE V2 — STRUCTURED DAG PLANNER
 * 
 * Checkpoint C9: Pure, deterministic plan generation from user QUEST objectives.
 * Executes zero capabilities, creates zero confirmation tokens, claims zero ledger rows.
 */

import {
  asPlanId,
  asPlanStepId,
  asQuestId,
  asTraceId,
  asCapabilityId,
} from "../types"
import type {
  ExecutionPlan,
  PlannerError,
  PlannerInput,
  PlannerModelAdapter,
  PlannerResult,
  PlannerStep,
  StructuredArguments,
} from "./types"
import { PLAN_LIMITS } from "./types"
import { ExecutionPlanSchema, PLANNER_OUTPUT_JSON_SCHEMA } from "./schema"
import { buildPlannerPrompt } from "./prompt"
import { extractStepReferences } from "./references"

export class StructuredPlanner {
  constructor(private readonly adapter: PlannerModelAdapter) {}

  /**
   * Generates a validated ExecutionPlan DAG from a QUEST objective.
   */
  public async plan(
    input: PlannerInput,
    options?: { readonly signal?: AbortSignal }
  ): Promise<PlannerResult> {
    // 1. Validate routed capabilities
    if (!input.capabilities || input.capabilities.length === 0) {
      return {
        success: false,
        error: {
          code: "CAPABILITY_NOT_ROUTED",
          message: "Cannot generate plan: no capabilities were routed by CapabilityRouter.",
        },
      }
    }

    const routedCapIds = new Set(input.capabilities.map((c) => c.id))

    // 2. Build prompt and invoke model adapter
    const prompt = buildPlannerPrompt(input)
    let rawOutput: unknown

    try {
      rawOutput = await this.adapter.generatePlan(
        prompt,
        PLANNER_OUTPUT_JSON_SCHEMA,
        options
      )
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: "MODEL_FAILURE",
          message: `Planner model adapter threw an exception: ${err instanceof Error ? err.message : String(err)}`,
          details: err,
        },
      }
    }

    // 3. Normalize JSON if model returned text
    let parsedJson: unknown = rawOutput

    if (typeof rawOutput === "string") {
      let cleaned = rawOutput.trim()
      // Strip markdown code fences if model enclosed JSON
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
      }
      try {
        parsedJson = JSON.parse(cleaned)
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            code: "INVALID_MODEL_OUTPUT",
            message: `Model returned unparseable prose or invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
            details: rawOutput,
          },
        }
      }
    }

    if (!parsedJson || typeof parsedJson !== "object") {
      return {
        success: false,
        error: {
          code: "INVALID_MODEL_OUTPUT",
          message: "Model output is null or not a JSON object.",
          details: rawOutput,
        },
      }
    }

    // 4. Verify serialized size limit
    const serializedBytes = Buffer.byteLength(JSON.stringify(parsedJson), "utf8")
    if (serializedBytes > PLAN_LIMITS.MAX_SERIALIZED_BYTES) {
      return {
        success: false,
        error: {
          code: "PLAN_LIMIT_EXCEEDED",
          message: `Plan serialized size (${serializedBytes} bytes) exceeds limit of ${PLAN_LIMITS.MAX_SERIALIZED_BYTES} bytes.`,
        },
      }
    }

    // 5. Schema validation via Zod
    const zodParsed = ExecutionPlanSchema.safeParse(parsedJson)
    if (!zodParsed.success) {
      return {
        success: false,
        error: {
          code: "SCHEMA_VIOLATION",
          message: "Plan schema validation failed.",
          details: zodParsed.error.issues,
        },
      }
    }

    const planData = zodParsed.data

    // 6. Check step count limits
    if (planData.steps.length > PLAN_LIMITS.MAX_STEPS) {
      return {
        success: false,
        error: {
          code: "PLAN_LIMIT_EXCEEDED",
          message: `Plan contains ${planData.steps.length} steps, exceeding limit of ${PLAN_LIMITS.MAX_STEPS}.`,
        },
      }
    }

    // 7. Check for duplicate step IDs
    const stepIds = new Set<string>()
    for (const step of planData.steps) {
      if (stepIds.has(step.id)) {
        return {
          success: false,
          error: {
            code: "SCHEMA_VIOLATION",
            message: `Duplicate step ID "${step.id}" found in plan.`,
          },
        }
      }
      stepIds.add(step.id)
    }

    // 8. Validate capability existence in routed set
    for (const step of planData.steps) {
      if (!routedCapIds.has(step.capabilityId as any)) {
        return {
          success: false,
          error: {
            code: "CAPABILITY_NOT_ROUTED",
            message: `Step "${step.id}" references unrouted or nonexistent capability "${step.capabilityId}".`,
            details: { stepId: step.id, capabilityId: step.capabilityId },
          },
        }
      }
    }

    // 9. Validate step dependencies (no self-dep, no unknown dep)
    for (const step of planData.steps) {
      if (step.dependsOn.includes(step.id)) {
        return {
          success: false,
          error: {
            code: "CYCLIC_DEPENDENCY",
            message: `Step "${step.id}" depends on itself.`,
            details: { stepId: step.id },
          },
        }
      }

      for (const depId of step.dependsOn) {
        if (!stepIds.has(depId)) {
          return {
            success: false,
            error: {
              code: "INVALID_REFERENCE",
              message: `Step "${step.id}" depends on nonexistent step "${depId}".`,
              details: { stepId: step.id, dependencyId: depId },
            },
          }
        }
      }
    }

    // 10. Validate output references ($ref)
    for (const step of planData.steps) {
      const refs = extractStepReferences(step.arguments)
      for (const ref of refs) {
        if (!stepIds.has(ref.stepId)) {
          return {
            success: false,
            error: {
              code: "INVALID_REFERENCE",
              message: `Step "${step.id}" references output from nonexistent step "${ref.stepId}".`,
              details: { stepId: step.id, reference: ref },
            },
          }
        }

        if (ref.stepId === step.id) {
          return {
            success: false,
            error: {
              code: "INVALID_REFERENCE",
              message: `Step "${step.id}" cannot reference its own output.`,
              details: { stepId: step.id, reference: ref },
            },
          }
        }

        // Must be in dependsOn
        if (!step.dependsOn.includes(ref.stepId)) {
          return {
            success: false,
            error: {
              code: "INVALID_REFERENCE",
              message: `Step "${step.id}" references output from step "${ref.stepId}", but "${ref.stepId}" is not in dependsOn.`,
              details: { stepId: step.id, reference: ref },
            },
          }
        }
      }
    }

    // 11. Cycle detection (Topological sort / Kahn's algorithm)
    const inDegree = new Map<string, number>()
    const adj = new Map<string, string[]>()

    for (const id of stepIds) {
      inDegree.set(id, 0)
      adj.set(id, [])
    }

    for (const step of planData.steps) {
      for (const dep of step.dependsOn) {
        adj.get(dep)?.push(step.id)
        inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1)
      }
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id)
    }

    let visitedCount = 0
    while (queue.length > 0) {
      const curr = queue.shift()!
      visitedCount++
      for (const neighbor of adj.get(curr) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDeg)
        if (newDeg === 0) {
          queue.push(neighbor)
        }
      }
    }

    if (visitedCount !== stepIds.size) {
      return {
        success: false,
        error: {
          code: "CYCLIC_DEPENDENCY",
          message: "Cycle detected in plan step dependency graph.",
        },
      }
    }

    // 12. Assemble typed ExecutionPlan
    const executionPlan: ExecutionPlan = {
      id: asPlanId(planData.id),
      questId: asQuestId(input.questId),
      traceId: asTraceId(input.traceId),
      objective: planData.objective,
      version: planData.version,
      steps: planData.steps.map((s) => ({
        id: asPlanStepId(s.id),
        objective: s.objective,
        capabilityId: asCapabilityId(s.capabilityId),
        arguments: s.arguments as StructuredArguments,
        dependsOn: s.dependsOn.map(asPlanStepId),
        completionCriteria: s.completionCriteria,
        required: s.required,
      })),
      createdAt: planData.createdAt ?? Date.now(),
    }

    return {
      success: true,
      plan: executionPlan,
    }
  }
}
