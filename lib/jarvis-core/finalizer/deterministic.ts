/**
 * JARVIS CORE V2 — DETERMINISTIC RESPONSE SYNTHESIZER
 * 
 * Checkpoint: C15 (Section C15.3)
 * Status: Authoritative Zero-Model Fallback Response Engine
 * 
 * Architectural Invariants:
 * 1. 100% Deterministic: No external model or network required.
 * 2. Absolute Grounding: Reports strictly what occurred in the execution ledger and step results.
 * 3. Anti-Hallucination: Never claims an uncommitted action was committed.
 */

import type { FinalizationFacts, FinalizerResponse } from "./types"
import { redactSecrets } from "./redaction"

export function synthesizeDeterministicResponse(facts: FinalizationFacts): FinalizerResponse {
  const lines: string[] = []

  // 1. Pending Confirmation
  if (facts.turnStatus === "CONFIRMATION_REQUIRED" && facts.pendingConfirmation) {
    const p = facts.pendingConfirmation
    lines.push(`⚠️ **Confirmation Required**`)
    lines.push(`The requested action requires explicit confirmation before proceeding:`)
    lines.push(`- **Action**: \`${p.capabilityId}\` (${p.title})`)
    lines.push(`- **Impact Level**: ${p.impactLevel}`)
    lines.push(`- **Reason**: ${p.reason}`)
    if (p.parameters && Object.keys(p.parameters).length > 0) {
      lines.push(`- **Parameters**: \`${JSON.stringify(p.parameters)}\``)
    }
    lines.push(`\nPlease approve or reject this action to continue.`)

    const text = lines.join("\n")
    const { sanitizedText, redactedCount } = redactSecrets(text)
    return {
      text: sanitizedText,
      grounded: true,
      turnStatus: facts.turnStatus,
      factsSummary: computeFactsSummary(facts),
      synthesizer: "DETERMINISTIC_FALLBACK",
      redactedSecretsCount: redactedCount,
    }
  }

  // 2. Direct Action Mode
  if (facts.executionMode === "DIRECT_ACTION") {
    const singleStep = facts.steps[0]
    if (facts.turnStatus === "SUCCEEDED") {
      lines.push(`✅ Successfully executed **${singleStep?.title ?? singleStep?.capabilityId ?? "action"}**.`)
      if (singleStep?.summary) {
        lines.push(singleStep.summary)
      } else if (singleStep?.result) {
        lines.push(`\`\`\`json\n${JSON.stringify(singleStep.result, null, 2)}\n\`\`\``)
      }
    } else {
      lines.push(`❌ Failed to execute **${singleStep?.title ?? singleStep?.capabilityId ?? "action"}**.`)
      if (singleStep?.error || facts.error) {
        lines.push(`Error: ${singleStep?.error ?? facts.error}`)
      }
    }

    const text = lines.join("\n")
    const { sanitizedText, redactedCount } = redactSecrets(text)
    return {
      text: sanitizedText,
      grounded: true,
      turnStatus: facts.turnStatus,
      factsSummary: computeFactsSummary(facts),
      synthesizer: "DETERMINISTIC_FALLBACK",
      redactedSecretsCount: redactedCount,
    }
  }

  // 3. Plan DAG Mode
  if (facts.executionMode === "PLAN_DAG") {
    const goalTitle = facts.goal ? ` for: "${facts.goal}"` : ""

    if (facts.turnStatus === "SUCCEEDED") {
      lines.push(`✅ Execution completed successfully${goalTitle}.`)
      lines.push(`\n**Executed Steps (${facts.steps.length}):**`)
      for (const step of facts.steps) {
        const detail = step.summary ? ` — ${step.summary}` : ""
        lines.push(`- ✅ \`${step.capabilityId}\`: ${step.title}${detail}`)
      }
    } else if (facts.turnStatus === "PARTIAL") {
      lines.push(`⚠️ Plan partially completed${goalTitle}.`)
      lines.push(`\n**Step Summary:**`)
      for (const step of facts.steps) {
        if (step.status === "SUCCEEDED" || step.status === "COMPLETED") {
          lines.push(`- ✅ \`${step.capabilityId}\`: ${step.title}`)
        } else if (step.status === "FAILED") {
          lines.push(`- ❌ \`${step.capabilityId}\`: ${step.title} (Failed: ${step.error ?? "unknown error"})`)
        } else if (step.status === "SKIPPED") {
          lines.push(`- ⏭️ \`${step.capabilityId}\`: ${step.title} (Skipped)`)
        } else {
          lines.push(`- ⏹️ \`${step.capabilityId}\`: ${step.title} (${step.status})`)
        }
      }
    } else {
      lines.push(`❌ Plan execution failed${goalTitle}.`)
      if (facts.error) {
        lines.push(`Failure reason: ${facts.error}`)
      }
      const failedSteps = facts.steps.filter((s) => s.status === "FAILED")
      if (failedSteps.length > 0) {
        lines.push(`\n**Failed Steps:**`)
        for (const s of failedSteps) {
          lines.push(`- ❌ \`${s.capabilityId}\`: ${s.title} — ${s.error ?? "error"}`)
        }
      }
    }

    const text = lines.join("\n")
    const { sanitizedText, redactedCount } = redactSecrets(text)
    return {
      text: sanitizedText,
      grounded: true,
      turnStatus: facts.turnStatus,
      factsSummary: computeFactsSummary(facts),
      synthesizer: "DETERMINISTIC_FALLBACK",
      redactedSecretsCount: redactedCount,
    }
  }

  // 4. Conversational / Generic Mode
  if (facts.turnStatus === "SUCCEEDED") {
    lines.push(`Completed request: "${facts.userMessage}"`)
  } else {
    lines.push(`Could not complete request: ${facts.error ?? "An error occurred."}`)
  }

  const text = lines.join("\n")
  const { sanitizedText, redactedCount } = redactSecrets(text)
  return {
    text: sanitizedText,
    grounded: true,
    turnStatus: facts.turnStatus,
    factsSummary: computeFactsSummary(facts),
    synthesizer: "DETERMINISTIC_FALLBACK",
    redactedSecretsCount: redactedCount,
  }
}

function computeFactsSummary(facts: FinalizationFacts): {
  totalSteps: number
  succeededSteps: number
  failedSteps: number
  committedOperations: number
} {
  const totalSteps = facts.steps.length
  const succeededSteps = facts.steps.filter(
    (s) => s.status === "SUCCEEDED" || s.status === "COMPLETED"
  ).length
  const failedSteps = facts.steps.filter((s) => s.status === "FAILED").length
  const committedOperations = facts.committedOperations.length

  return {
    totalSteps,
    succeededSteps,
    failedSteps,
    committedOperations,
  }
}
