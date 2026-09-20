/**
 * JARVIS CORE V2 — PLANNER PROMPT BUILDER
 * 
 * Checkpoint C9: Bounded prompt assembly exposing ONLY C7-routed capabilities.
 */

import type { PlannerInput } from "./types"
import { PLAN_LIMITS } from "./types"

/**
 * Builds the structured prompt for plan generation.
 */
export function buildPlannerPrompt(input: PlannerInput): string {
  const capDescriptions = input.capabilities.map((cap) => {
    const lines = [
      `- CapabilityId: "${cap.id}"`,
      `  Description: ${cap.description}`,
      `  Domain: ${cap.domain}`,
      `  ActionClass: ${cap.actionClass}`,
    ]
    if (cap.inputSchema) {
      try {
        lines.push(`  InputSchema: ${JSON.stringify(cap.inputSchema)}`)
      } catch {
        // Ignore unstringifiable schema
      }
    }
    return lines.join("\n")
  }).join("\n\n")

  const contextSection = input.conversationContext && input.conversationContext.length > 0
    ? `### Relevant Conversation Context:\n` +
      input.conversationContext.map((c) => `[${c.role}]: ${c.content}`).join("\n")
    : ""

  const replanSection = input.replanReason
    ? `### Replanning Reason:\nThis is a replan pass for existing quest "${input.questId}". Reason: ${input.replanReason}\n`
    : ""

  return `You are the Jarvis Structured DAG Planner.
Your task is to decompose the user's objective into a strict, machine-validatable Directed Acyclic Graph (DAG) of execution steps.

### User Objective:
"${input.objective}"

${contextSection}

${replanSection}

### Available Capabilities (ROUTED BY CAPABILITY ROUTER):
Only use capabilities from this list. You CANNOT invent tools or use capabilities not listed below:
${capDescriptions}

### Rules for Structured Planning:
1. Return ONLY valid JSON matching the schema. Zero explanations, prose, or markdown code blocks.
2. Max steps: ${PLAN_LIMITS.MAX_STEPS}. Keep plans minimal and focused on the objective.
3. Step dependencies ("dependsOn"): If Step B requires data from Step A, Step A's ID MUST be in Step B's "dependsOn" array.
4. Typed Step References: To pass output from Step A to Step B, use RFC 6901 JSON pointer syntax:
   { "$ref": { "stepId": "step_id_a", "path": "/property_name" } }
5. Independent read-only steps should NOT depend on each other so they can execute in parallel.
6. Each step must have a concrete "objective", exact "capabilityId", and appropriate "completionCriteria".
7. QuestId: "${input.questId}"
8. TraceId: "${input.traceId}"
`
}
