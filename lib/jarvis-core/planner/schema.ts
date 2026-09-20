/**
 * JARVIS CORE V2 — PLANNER ZOD SCHEMAS & JSON SPECIFICATION
 * 
 * Checkpoint C9: Strict runtime validation of structured model output.
 */

import { z } from "zod"
import { PLAN_LIMITS } from "./types"

export const CompletionCriterionSchema = z.object({
  type: z.enum([
    "CAPABILITY_SUCCEEDED",
    "OUTPUT_PRESENT",
    "DEPENDENCY_RESOLVED",
    "CONFIRMATION_ACCEPTED",
  ]),
  path: z.string().optional(),
  description: z.string().optional(),
})

export const StepOutputReferenceSchema = z.object({
  stepId: z.string().min(1, "stepId must not be empty"),
  path: z.string().min(1, "path must not be empty"),
})

export const PlannerStepSchema = z.object({
  id: z.string().min(1, "Step id must not be empty"),
  objective: z.string().min(1, "Step objective must not be empty"),
  capabilityId: z.string().min(1, "capabilityId must not be empty"),
  arguments: z.record(z.string(), z.unknown()).default({}),
  dependsOn: z.array(z.string()).default([]),
  completionCriteria: z
    .array(CompletionCriterionSchema)
    .default([{ type: "CAPABILITY_SUCCEEDED" }]),
  required: z.boolean().default(true),
})

export const ExecutionPlanSchema = z.object({
  id: z.string().min(1, "Plan id must not be empty"),
  questId: z.string().min(1, "questId must not be empty"),
  traceId: z.string().min(1, "traceId must not be empty"),
  objective: z.string().min(1, "objective must not be empty"),
  version: z.number().int().min(1).default(1),
  steps: z
    .array(PlannerStepSchema)
    .min(1, "Plan must contain at least 1 step")
    .max(
      PLAN_LIMITS.MAX_STEPS,
      `Plan exceeds maximum limit of ${PLAN_LIMITS.MAX_STEPS} steps`
    ),
  createdAt: z.number().optional(),
})

/**
 * Expected JSON schema presented to LLM adapters for structured plan generation.
 */
export const PLANNER_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Unique plan ID (e.g. plan_123)" },
    questId: { type: "string", description: "Target Quest ID" },
    traceId: { type: "string", description: "Turn or Trace ID" },
    objective: { type: "string", description: "High-level goal of the plan" },
    version: { type: "integer", description: "Plan version, defaults to 1" },
    steps: {
      type: "array",
      description: "Ordered DAG steps to achieve the objective",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Step ID (e.g. step_1, step_2)" },
          objective: { type: "string", description: "Concrete subgoal for this step" },
          capabilityId: { type: "string", description: "Exact capability ID from routed list" },
          arguments: {
            type: "object",
            description: "Literal arguments or { $ref: { stepId, path } }",
          },
          dependsOn: {
            type: "array",
            items: { type: "string" },
            description: "List of step IDs that must succeed before this step runs",
          },
          completionCriteria: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "CAPABILITY_SUCCEEDED",
                    "OUTPUT_PRESENT",
                    "DEPENDENCY_RESOLVED",
                    "CONFIRMATION_ACCEPTED",
                  ],
                },
                path: { type: "string" },
                description: { type: "string" },
              },
              required: ["type"],
            },
          },
          required: { type: "boolean", description: "Whether step is required for full goal completion" },
        },
        required: ["id", "objective", "capabilityId"],
      },
    },
  },
  required: ["id", "questId", "traceId", "objective", "steps"],
} as const
