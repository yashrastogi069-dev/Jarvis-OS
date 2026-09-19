/**
 * JARVIS CORE V2 — CANONICAL CAPABILITY REGISTRY TYPES
 * 
 * Checkpoint: C2 (Milestone 0)
 * Status: Authoritative Capability Substrate
 * 
 * Architectural Invariants:
 * 1. Framework & Orchestrator Independent: ZERO imports of React, Next.js,
 *    or ToolLoopAgent. A Capability represents what Jarvis can do, decoupled
 *    from how any particular agent loop exposes or executes it.
 * 2. C1 Vocabulary Reuse: Inherits CapabilityId, ActionClass, IdempotencyClass,
 *    CapabilityAvailability, and JsonObject directly from `../types`.
 * 3. Metadata Only: Stores static contracts, schemas, confirmation requirements,
 *    and idempotency metadata. Does NOT execute C3 ToolResult wrapping, C4 policy
 *    enforcement, C5 ledger deduplication, or C7 dynamic routing.
 */

import { z } from "zod"
import type {
  CapabilityId,
  ActionClass,
  CapabilityAvailability,
  IdempotencyClass,
  JsonObject,
} from "../types"
export type { IdempotencyClass }
import type { CapabilityExecutionContext } from "./result"

// ============================================================================
// 1. DOMAIN VOCABULARY
// ============================================================================

/**
 * Finite domain vocabulary based on actual repository source and evaluation corpora.
 * Exactly 12 core domains plus system for OS/internal operations:
 * - tasks (6)
 * - memory (4)
 * - research (2)
 * - skills (3)
 * - feed (1)
 * - wake_words (3)
 * - preferences (1)
 * - github (6)
 * - google (10)
 * - apple (5)
 * - telegram (2)
 * - obsidian (4)
 * - system (engine / OS settings)
 */
export type CapabilityDomain =
  | "tasks"
  | "memory"
  | "research"
  | "skills"
  | "feed"
  | "wake_words"
  | "preferences"
  | "github"
  | "google"
  | "apple"
  | "telegram"
  | "obsidian"
  | "system"

export const ALL_CAPABILITY_DOMAINS: ReadonlyArray<CapabilityDomain> = [
  "tasks",
  "memory",
  "research",
  "skills",
  "feed",
  "wake_words",
  "preferences",
  "github",
  "google",
  "apple",
  "telegram",
  "obsidian",
  "system",
] as const

// ============================================================================
// 2. CONFIRMATION METADATA (C4 Preparation)
// ============================================================================

export type ConfirmationPolicyLevel =
  | "NONE"            // Action is safe to execute autonomously without confirmation
  | "REQUIRED"        // Action requires user confirmation before execution
  | "CONDITIONAL"     // Confirmation required only when certain thresholds or flags trigger
  | "POLICY_MANAGED"  // Delegated to runtime security policy in C4

export type CapabilityCriticality =
  | "LOW"       // Read-only or reversible local change
  | "MEDIUM"    // Modifies existing data or non-critical state
  | "HIGH"      // Irreversible delete or creates remote entity
  | "CRITICAL"  // External irreversible communication (e.g. email/chat send)

export interface CapabilityConfirmationMetadata {
  readonly defaultPolicy: ConfirmationPolicyLevel
  readonly criticality?: CapabilityCriticality
  readonly previewSupported?: boolean
  readonly reason?: string
}

// ============================================================================
// 3. IDEMPOTENCY METADATA (C5 Preparation)
// ============================================================================

export interface CapabilityIdempotencyMetadata {
  readonly idempotencyClass: IdempotencyClass
  readonly naturalKey?: ReadonlyArray<string>
  readonly duplicateRisk?: string
}

// ============================================================================
// 4. REQUIREMENTS & AVAILABILITY METADATA
// ============================================================================

export interface CapabilityRequirements {
  readonly requiredEnv?: ReadonlyArray<string>
  readonly requiredSettings?: ReadonlyArray<string>
  readonly localService?: string
}

export interface CapabilityAvailabilityMetadata {
  readonly staticState: CapabilityAvailability
  /**
   * Fast, non-blocking check of local configuration (env vars or local SQLite settings).
   * Invariant: MUST NEVER make external network calls or block process startup.
   */
  readonly isLocallyConfigured?: () => { readonly available: boolean; readonly reason?: string }
}

// ============================================================================
// 5. ROUTING METADATA (C7 Preparation)
// ============================================================================

export interface CapabilityRoutingMetadata {
  readonly keywords?: ReadonlyArray<string>
  readonly domainHints?: ReadonlyArray<string>
  readonly promptVisibility?: boolean
}

// ============================================================================
// 6. CANONICAL CAPABILITY DEFINITION
// ============================================================================

export interface CapabilityDefinition<TInput = any, TOutput = any> {
  readonly id: CapabilityId
  readonly legacyToolName: string
  readonly domain: CapabilityDomain
  readonly title: string
  readonly description: string
  readonly inputSchema: z.ZodType<TInput>
  readonly handler: (input: TInput, context?: CapabilityExecutionContext | any) => Promise<TOutput>
  readonly actionClass: ActionClass
  readonly confirmation: CapabilityConfirmationMetadata
  readonly idempotency: CapabilityIdempotencyMetadata
  readonly requirements: CapabilityRequirements
  readonly availability: CapabilityAvailabilityMetadata
  readonly routing: CapabilityRoutingMetadata
  readonly userFacing: boolean
}

// ============================================================================
// 7. UNREGISTERED CANDIDATE CLASSIFICATION (Section 14)
// ============================================================================

export type CandidateClassification =
  | "USER_FACING"
  | "INTERNAL_ENGINE"
  | "BACKGROUND"
  | "NOT_READY"
  | "DEPRECATED"

export interface UnregisteredCandidateInfo {
  readonly name: string
  readonly implementationFile: string
  readonly classification: CandidateClassification
  readonly intendedPurpose: string
  readonly sideEffects: string
  readonly safetyRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  readonly rationale: string
  readonly targetCheckpoint?: string
  readonly deferredCode?: string
}

// ============================================================================
// 8. REGISTRY VALIDATION (Section 17)
// ============================================================================

export interface RegistryValidationResult {
  readonly valid: boolean
  readonly errors: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
  readonly totalCapabilities: number
  readonly userFacingCount: number
}
