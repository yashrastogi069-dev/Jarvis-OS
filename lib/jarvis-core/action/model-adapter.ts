/**
 * JARVIS CORE V2 — ROUTER ACTION ARGUMENT MODEL ADAPTER
 * 
 * Checkpoint: Pre-Migration Gate C
 * Connects ProviderRoleRouter ("ACTION_RESOLVER" role) to Direct Action Argument Resolver
 * for non-trivial natural language commands that exceed deterministic regex capabilities.
 */

import { z } from "zod"
import type { ActionArgumentModel, ActionArgumentResolverInput } from "./types"
import type { ProviderRoleRouter } from "../providers/router"
import type { TurnDeadline } from "../providers/deadline"

export class RouterActionArgumentModel implements ActionArgumentModel {
  constructor(
    private readonly router: ProviderRoleRouter,
    private readonly deadline?: TurnDeadline,
  ) {}

  public async resolveArguments(input: ActionArgumentResolverInput): Promise<Record<string, unknown> | null> {
    const { userRequest, capabilityId, capability, conversationContext } = input

    const systemPrompt = `You are a precision argument extractor for the capability "${capabilityId}".
Capability Description: ${capability.description}
Extract the structured parameters matching the required schema from the user request.
Do NOT invent parameters not mentioned. Return ONLY the extracted fields matching the schema.`

    const prompt = `User Request: "${userRequest}"
${
  conversationContext && conversationContext.length > 0
    ? `Recent Conversation Context:\n${conversationContext.map((c) => `${c.role}: ${c.content}`).join("\n")}\n`
    : ""
}Extract candidate arguments for capability "${capabilityId}".`

    const result = await this.router.generateObject(
      "ACTION_RESOLVER",
      prompt,
      capability.inputSchema,
      {
        systemPrompt,
        deadline: this.deadline,
        temperature: 0.0,
      }
    )

    if (result && result.object && typeof result.object === "object") {
      return result.object as Record<string, unknown>
    }
    return null
  }
}
