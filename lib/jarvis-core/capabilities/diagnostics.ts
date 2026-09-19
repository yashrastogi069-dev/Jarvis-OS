/**
 * JARVIS CORE V2 — CAPABILITY REGISTRY DIAGNOSTICS
 * 
 * Checkpoint: C2 (Section 18)
 * Status: Authoritative Developer Diagnostic Utility
 * 
 * Provides automated inspection of:
 * - Registered vs User-Facing capability counts
 * - Domain distribution
 * - Read-Only vs Mutation counts
 * - Confirmation categories
 * - Idempotency categories
 * - Static authentication & configuration requirements
 * - Implemented-but-unregistered skill candidates
 * - Zero secret leakage
 */

import { capabilityRegistry } from "./registry"
import { UNREGISTERED_CANDIDATES } from "./definitions/unregistered"
import type { CapabilityDomain } from "./types"
import type { ActionClass } from "../types"

export interface CapabilityDiagnosticsReport {
  readonly totalRegistered: number
  readonly totalUserFacing: number
  readonly domainBreakdown: Record<CapabilityDomain, number>
  readonly readOnlyCount: number
  readonly mutationCount: number
  readonly actionClassBreakdown: Record<ActionClass, number>
  readonly confirmationBreakdown: Record<string, number>
  readonly idempotencyBreakdown: Record<string, number>
  readonly staticRequirementsBreakdown: {
    readonly requiresEnv: number
    readonly requiresSettings: number
    readonly localServiceOnly: number
  }
  readonly unregisteredCandidatesCount: number
  readonly unregisteredCandidates: ReadonlyArray<{
    readonly name: string
    readonly classification: string
    readonly safetyRisk: string
    readonly rationale: string
    readonly deferredCode?: string
  }>
}

/**
 * Compute real-time capability diagnostics from the canonical registry.
 */
export function getCapabilityDiagnostics(): CapabilityDiagnosticsReport {
  const all = capabilityRegistry.getAll()
  const userFacing = capabilityRegistry.getUserFacing()

  const domainBreakdown: Record<string, number> = {}
  const actionClassBreakdown: Record<string, number> = {}
  const confirmationBreakdown: Record<string, number> = {}
  const idempotencyBreakdown: Record<string, number> = {}

  let readOnlyCount = 0
  let mutationCount = 0
  let requiresEnv = 0
  let requiresSettings = 0
  let localServiceOnly = 0

  for (const cap of all) {
    // Domains
    domainBreakdown[cap.domain] = (domainBreakdown[cap.domain] ?? 0) + 1

    // Action Classes
    actionClassBreakdown[cap.actionClass] = (actionClassBreakdown[cap.actionClass] ?? 0) + 1
    if (cap.actionClass === "READ_ONLY") {
      readOnlyCount++
    } else {
      mutationCount++
    }

    // Confirmation
    const confKey = cap.confirmation.defaultPolicy
    confirmationBreakdown[confKey] = (confirmationBreakdown[confKey] ?? 0) + 1

    // Idempotency
    const idemKey = cap.idempotency.idempotencyClass
    idempotencyBreakdown[idemKey] = (idempotencyBreakdown[idemKey] ?? 0) + 1

    // Requirements
    if (cap.requirements.requiredEnv && cap.requirements.requiredEnv.length > 0) {
      requiresEnv++
    } else if (cap.requirements.requiredSettings && cap.requirements.requiredSettings.length > 0) {
      requiresSettings++
    } else {
      localServiceOnly++
    }
  }

  return {
    totalRegistered: all.length,
    totalUserFacing: userFacing.length,
    domainBreakdown: domainBreakdown as Record<CapabilityDomain, number>,
    readOnlyCount,
    mutationCount,
    actionClassBreakdown: actionClassBreakdown as Record<ActionClass, number>,
    confirmationBreakdown,
    idempotencyBreakdown,
    staticRequirementsBreakdown: {
      requiresEnv,
      requiresSettings,
      localServiceOnly,
    },
    unregisteredCandidatesCount: UNREGISTERED_CANDIDATES.length,
    unregisteredCandidates: UNREGISTERED_CANDIDATES.map((c) => ({
      name: c.name,
      classification: c.classification,
      safetyRisk: c.safetyRisk,
      rationale: c.rationale,
      deferredCode: c.deferredCode,
    })),
  }
}

/**
 * Format diagnostics report as a clean human-readable markdown table.
 */
export function formatDiagnosticsSummary(): string {
  const diag = getCapabilityDiagnostics()
  const lines: string[] = [
    `# Jarvis Core V2 — Capability Registry Diagnostic Summary`,
    ``,
    `* **Total Registered Capabilities**: ${diag.totalRegistered}`,
    `* **Total User-Facing Capabilities**: ${diag.totalUserFacing}`,
    `* **Read-Only Capabilities**: ${diag.readOnlyCount}`,
    `* **Mutating Capabilities**: ${diag.mutationCount}`,
    ``,
    `## Domain Breakdown (12 Domains)`,
    ...Object.entries(diag.domainBreakdown).map(([domain, count]) => `  - **${domain}**: ${count}`),
    ``,
    `## Action-Class Breakdown`,
    ...Object.entries(diag.actionClassBreakdown).map(([ac, count]) => `  - **${ac}**: ${count}`),
    ``,
    `## Confirmation Policy Breakdown`,
    ...Object.entries(diag.confirmationBreakdown).map(([pol, count]) => `  - **${pol}**: ${count}`),
    ``,
    `## Idempotency Breakdown`,
    ...Object.entries(diag.idempotencyBreakdown).map(([idem, count]) => `  - **${idem}**: ${count}`),
    ``,
    `## Static Requirements`,
    `  - Local SQLite / Service Only: ${diag.staticRequirementsBreakdown.localServiceOnly}`,
    `  - Requires Environment Variables: ${diag.staticRequirementsBreakdown.requiresEnv}`,
    `  - Requires Connector Settings / OAuth: ${diag.staticRequirementsBreakdown.requiresSettings}`,
    ``,
    `## Implemented But Unregistered Candidates (4 Functions)`,
    ...diag.unregisteredCandidates.map(
      (c) => `  - **${c.name}** [${c.classification}] (${c.safetyRisk} risk): ${c.rationale} [Tracked: ${c.deferredCode}]`,
    ),
  ]

  return lines.join("\n")
}
