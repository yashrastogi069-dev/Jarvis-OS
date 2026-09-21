/**
 * JARVIS CORE V2 — DIRECT ACTION ARGUMENT RESOLVER
 * 
 * Checkpoint: Pre-Phase-4 Repair Gate E
 * Extracts candidate capability arguments deterministically or via provider-neutral
 * ActionArgumentModel adapter, then passes through canonical input normalization.
 */

import type { CapabilityId } from "../types"
import type { CapabilityDefinition } from "../capabilities/types"
import { normalizeCapabilityInput } from "../capabilities/normalizer"
import type {
  ActionArgumentModel,
  ActionArgumentResolverInput,
  ActionResolutionResult,
} from "./types"

export class ActionArgumentResolver {
  /**
   * Resolve user request into canonical capability arguments.
   */
  public async resolve(
    input: ActionArgumentResolverInput,
    modelAdapter?: ActionArgumentModel
  ): Promise<ActionResolutionResult> {
    const { userRequest, capabilityId, capability } = input
    const trimmed = userRequest.trim()

    // 1. Attempt Safe Deterministic Extraction for Obvious Patterns
    const deterministicCandidate = this.extractDeterministic(capabilityId, trimmed)

    let candidateArgs = deterministicCandidate

    // 2. If deterministic extraction didn't yield all fields, invoke model adapter if provided
    if (!candidateArgs && modelAdapter) {
      try {
        const modelArgs = await modelAdapter.resolveArguments(input)
        if (modelArgs && typeof modelArgs === "object") {
          candidateArgs = modelArgs
        }
      } catch (err: any) {
        return {
          status: "INVALID",
          capabilityId,
          error: `Model argument resolution failed: ${err?.message || "Unknown error"}`,
        }
      }
    }

    if (!candidateArgs) {
      return this.deriveClarification(capabilityId, capability, trimmed)
    }

    // 3. Schema Normalization Gate (Repair Gate B)
    const norm = normalizeCapabilityInput(capability, candidateArgs)
    if (!norm.success) {
      return {
        status: "INVALID",
        capabilityId,
        candidateArguments: candidateArgs,
        error: norm.error.message,
      }
    }

    return {
      status: "RESOLVED",
      capabilityId,
      candidateArguments: candidateArgs,
      canonicalArguments: norm.canonicalArgs,
    }
  }

  private extractDeterministic(
    capabilityId: string,
    text: string
  ): Record<string, unknown> | null {
    const lower = text.toLowerCase()

    // 1. Task Create
    if (capabilityId === "tasks.create") {
      const match = text.match(
        /\b(?:create\s+(?:a\s+)?task|add\s+(?:a\s+)?task|remind\s+me\s+to|i\s+need\s+to)\s+(?:called|named|to\s+)?(.+)/i
      )
      if (match && match[1]) {
        return { title: match[1].trim() }
      }
    }

    // 2. Task Complete
    if (capabilityId === "tasks.complete") {
      const match = text.match(/\b(?:complete|finish|mark)\s+task\s+#?(\d+)/i)
      if (match && match[1]) {
        return { id: parseInt(match[1], 10) }
      }
    }

    // 3. Task Delete
    if (capabilityId === "tasks.delete") {
      const match = text.match(/\b(?:delete|remove)\s+task\s+#?(\d+)/i)
      if (match && match[1]) {
        return { id: parseInt(match[1], 10) }
      }
    }

    // 4. Memory Save
    if (capabilityId === "memory.save") {
      const match = text.match(
        /\b(?:remember\s+that|save\s+(?:to|in)?\s*memory|store\s+(?:to|in)?\s*memory)\s+(.+)/i
      )
      if (match && match[1]) {
        return { content: match[1].trim() }
      }
    }

    // 5. Memory Delete
    if (capabilityId === "memory.delete") {
      const match = text.match(/\b(?:delete|remove|forget)\s+memory\s+#?(\d+)/i)
      if (match && match[1]) {
        return { id: parseInt(match[1], 10) }
      }
    }

    // 6. Telegram Send
    if (capabilityId === "telegram.message.send") {
      const match = text.match(
        /\b(?:send\s+(?:a\s+)?telegram(?:\s+message)?)\s+(?:saying|that\s+says|:\s*)?(.+)/i
      )
      if (match && match[1]) {
        return { text: match[1].trim().replace(/^["']|["']$/g, "") }
      }
    }

    // 7. Wake Word Add
    if (capabilityId === "wake_words.add") {
      const match = text.match(/\badd\s+wake\s+word\s+['"]?([^'"]+)['"]?/i)
      if (match && match[1]) {
        return { phrase: match[1].trim().toLowerCase(), action: "activate-voice" }
      }
    }

    // 8. Wake Word Remove
    if (capabilityId === "wake_words.remove") {
      const match = text.match(/\b(?:remove|delete)\s+wake\s+word\s+#?([a-zA-Z0-9_-]+)/i)
      if (match && match[1]) {
        return { id: match[1].trim() }
      }
    }

    // 9. Preferences Set
    if (capabilityId === "preferences.set") {
      const match = text.match(/\b(?:change|set)\s+theme\s+to\s+([a-zA-Z0-9_-]+)/i)
      if (match && match[1]) {
        return { theme: match[1].trim() }
      }
    }

    return null
  }

  private deriveClarification(
    capabilityId: CapabilityId,
    capability: CapabilityDefinition,
    text: string
  ): ActionResolutionResult {
    if (capabilityId === "google.mail.message.send") {
      return {
        status: "NEEDS_CLARIFICATION",
        capabilityId,
        clarificationPrompt: "Who should I send this email to, and what should the subject and message say?",
        missingFields: ["to", "subject", "body"],
      }
    }

    if (capabilityId === "tasks.delete" || capabilityId === "memory.delete") {
      return {
        status: "NEEDS_CLARIFICATION",
        capabilityId,
        clarificationPrompt: `Which ${capability.domain} ID would you like to delete?`,
        missingFields: ["id"],
      }
    }

    return {
      status: "NEEDS_CLARIFICATION",
      capabilityId,
      clarificationPrompt: `Could you provide more details for ${capability.title}?`,
    }
  }
}
