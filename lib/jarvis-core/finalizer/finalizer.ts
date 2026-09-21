/**
 * JARVIS CORE V2 — GROUNDED FINALIZER & RESPONSE GENERATOR
 * 
 * Checkpoint: C15 (Section C15.4)
 * Status: Authoritative Finalizer Engine
 * 
 * Architectural Invariants:
 * 1. Grounded Facts Only: The finalizer only synthesizes from verified execution facts and ledger records.
 * 2. Zero Model Authority: The finalizer has zero tools and zero execution power.
 * 3. Secret Redaction: All outputs are scrubbed for secrets and credentials before emission.
 * 4. Deterministic Fallback: Automatically falls back to deterministic synthesis on provider failure or timeout.
 */

import type { ProviderRoleRouter } from "../providers/router"
import type { TurnDeadline } from "../providers/deadline"
import type { FinalizationFacts, FinalizerResponse } from "./types"
import { synthesizeDeterministicResponse } from "./deterministic"
import { redactSecrets } from "./redaction"

export interface GroundedFinalizerOptions {
  readonly router?: ProviderRoleRouter
  readonly enableModelFinalizer?: boolean
}

export class GroundedFinalizer {
  private readonly router?: ProviderRoleRouter
  private readonly enableModel: boolean

  constructor(options?: GroundedFinalizerOptions) {
    this.router = options?.router
    this.enableModel = options?.enableModelFinalizer ?? true
  }

  /**
   * Finalize turn facts into a user-facing response.
   */
  public async finalize(
    facts: FinalizationFacts,
    options?: { deadline?: TurnDeadline; signal?: AbortSignal }
  ): Promise<FinalizerResponse> {
    // If model finalization is disabled or router is not available, synthesize deterministically
    if (!this.enableModel || !this.router) {
      return synthesizeDeterministicResponse(facts)
    }

    // Check deadline; if already soft-expired or remaining time is too short (<1000ms),
    // immediately use deterministic fallback to avoid hard timeout
    if (options?.deadline?.isSoftExpired() || (options?.deadline && options.deadline.remainingMs() < 1000)) {
      return synthesizeDeterministicResponse(facts)
    }

    try {
      const prompt = this.buildPrompt(facts)
      const systemPrompt = this.buildSystemPrompt()

      const response = await this.router.generateText("FINALIZER", prompt, {
        deadline: options?.deadline,
        signal: options?.signal,
        systemPrompt,
        temperature: 0.2, // Low temperature for grounded truthfulness
      })

      const rawText = response.text.trim()
      if (!rawText) {
        return synthesizeDeterministicResponse(facts)
      }

      // Redact any accidental secrets
      const { sanitizedText, redactedCount } = redactSecrets(rawText)

      return {
        text: sanitizedText,
        grounded: true,
        turnStatus: facts.turnStatus,
        factsSummary: {
          totalSteps: facts.steps.length,
          succeededSteps: facts.steps.filter(
            (s) => s.status === "SUCCEEDED" || s.status === "COMMITTED"
          ).length,
          failedSteps: facts.steps.filter((s) => s.status === "FAILED").length,
          committedOperations: facts.committedOperations.length,
        },
        synthesizer: "MODEL",
        redactedSecretsCount: redactedCount,
      }
    } catch (error) {
      // Deterministic fallback on any model failure, timeout, or schema error
      return synthesizeDeterministicResponse(facts)
    }
  }

  private buildSystemPrompt(): string {
    return [
      "You are the Jarvis Grounded Finalizer.",
      "Your sole task is to generate a concise, truthful, and helpful final response to the user based STRICTLY on verified execution facts.",
      "",
      "STRICT INVARIANTS:",
      "1. Zero Tool Authority: You cannot execute tools, schedule actions, or claim pending actions succeeded.",
      "2. Absolute Grounding: If an action was NOT completed or COMMITTED in the provided facts, you MUST NOT claim it succeeded.",
      "3. Confirmation Requirements: If an action requires confirmation, clearly explain what was prepared, why approval is required, and prompt the user to confirm.",
      "4. Partial Executions: If some steps succeeded and others failed, list both transparently.",
      "5. Tone: Direct, professional, no sycophantic preamble, no filler.",
    ].join("\n")
  }

  private buildPrompt(facts: FinalizationFacts): string {
    return [
      `USER QUERY: "${facts.userMessage}"`,
      `EXECUTION MODE: ${facts.executionMode}`,
      `TURN STATUS: ${facts.turnStatus}`,
      facts.goal ? `GOAL: ${facts.goal}` : "",
      facts.error ? `TOP-LEVEL ERROR: ${facts.error}` : "",
      "",
      "EXECUTION FACTS (STEPS):",
      ...facts.steps.map(
        (s, i) =>
          `[${i + 1}] Step "${s.title}" (${s.capabilityId}) -> STATUS: ${s.status}${
            s.summary ? ` | ${s.summary}` : ""
          }${s.error ? ` | ERROR: ${s.error}` : ""}`
      ),
      "",
      "COMMITTED OPERATIONS (LEDGER):",
      facts.committedOperations.length === 0
        ? "None"
        : facts.committedOperations
            .map(
              (op) =>
                `- Op ${op.operationId} [${op.capabilityId}]: Status ${op.status} | Entity: ${op.entityType ?? "n/a"} (${op.entityId ?? "n/a"})`
            )
            .join("\n"),
      "",
      facts.pendingConfirmation
        ? [
            "PENDING CONFIRMATION REQUIRED:",
            `- Capability: ${facts.pendingConfirmation.capabilityId} (${facts.pendingConfirmation.title})`,
            `- Impact: ${facts.pendingConfirmation.impactLevel}`,
            `- Reason: ${facts.pendingConfirmation.reason}`,
            `- Parameters: ${JSON.stringify(facts.pendingConfirmation.parameters)}`,
          ].join("\n")
        : "",
      "",
      "Please synthesize a clear, grounded final response to the user following the strict invariants.",
    ]
      .filter(Boolean)
      .join("\n")
  }
}
