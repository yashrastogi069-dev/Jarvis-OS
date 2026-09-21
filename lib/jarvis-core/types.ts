/**
 * JARVIS CORE V2 — FOUNDATION DOMAIN TYPES & RUNTIME CONTRACTS
 * 
 * Checkpoint: C1 (Milestone 0) — Amended
 * Status: Authoritative Foundation Vocabulary
 * 
 * Architectural Invariants:
 * 1. Framework-independent: ZERO imports of React, Next.js request/response types,
 *    browser APIs, ToolLoopAgent, or Vercel AI SDK stream chunk types.
 * 2. JSON-safe: Fields intended to cross persistence (SQLite), network streams (SSE),
 *    logs, or provider boundaries strictly use JsonValue / JsonObject.
 * 3. Minimal shared vocabulary: Provides the type contracts for C2 (Registry),
 *    C3 (ToolResult boundary), C4 (Action policy), C5 (Ledger), C6-C8 (Quest/Router),
 *    and C9-C13 (Planner/DAG) without prematurely implementing their logic.
 * 4. Branched Execution Lifecycles: Non-linear state machines supporting fast paths
 *    (CHAT, READ, ACTION) without forcing planning or graph overhead onto simple queries.
 */

// ============================================================================
// 1. JSON-SAFE PRIMITIVES & STRUCTURES (Section 8)
// ============================================================================

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

// ============================================================================
// 2. STRONG IDENTITIES (Section D)
// ============================================================================

export type TraceId = string & { readonly __brand: "TraceId" }
export type TurnId = string & { readonly __brand: "TurnId" }
export type QuestId = string & { readonly __brand: "QuestId" }
export type PlanId = string & { readonly __brand: "PlanId" }
export type PlanStepId = string & { readonly __brand: "PlanStepId" }
export type CapabilityId = string & { readonly __brand: "CapabilityId" }
export type ToolCallId = string & { readonly __brand: "ToolCallId" }
export type OperationId = string & { readonly __brand: "OperationId" }

/** Compile-time identity constructors / type-guards for JSON-safe ID branding */
export const asTraceId = (id: string): TraceId => id as TraceId
export const asTurnId = (id: string): TurnId => id as TurnId
export const asQuestId = (id: string): QuestId => id as QuestId
export const asPlanId = (id: string): PlanId => id as PlanId
export const asPlanStepId = (id: string): PlanStepId => id as PlanStepId
export const asCapabilityId = (id: string): CapabilityId => id as CapabilityId
export const asToolCallId = (id: string): ToolCallId => id as ToolCallId
export const asOperationId = (id: string): OperationId => id as OperationId

// ============================================================================
// 3. EXECUTION MODES & INTENT OUTCOME (Section E & Step 3)
// ============================================================================

/**
 * Top-level execution mode determining how a resolved request executes.
 * AMBIGUOUS is intentionally excluded: ambiguity is an unresolved classification
 * outcome handled via TurnStatus.NEEDS_CLARIFICATION rather than an execution mode.
 */
export type ExecutionMode =
  | "CHAT"    // Conversational turn; no real-world tool capability required
  | "READ"    // Single or small bounded collection of read-only queries (e.g. check calendar, search web)
  | "ACTION"  // Single bounded, explicit state-changing action (e.g. snooze task, create reminder)
  | "QUEST"   // Multi-step, compound, or dependency-driven objective requiring planning and verification

/**
 * Result of intent classification. If unresolved, the turn pauses for clarification.
 */
export type ClassificationOutcome =
  | {
      readonly resolved: true
      readonly mode: ExecutionMode
      readonly confidence: number
      readonly rationale?: string
    }
  | {
      readonly resolved: false
      readonly needsClarification: true
      readonly clarificationPrompt: string
      readonly options?: ReadonlyArray<string>
      readonly rationale?: string
    }

// ============================================================================
// 4. TRACE CONTEXT (Section O)
// ============================================================================

/**
 * Universal correlation context propagated across all subsystems, logging, and metrics.
 */
export interface TraceContext {
  readonly traceId: TraceId
  readonly turnId: TurnId
  readonly questId?: QuestId
  readonly planId?: PlanId
  readonly stepId?: PlanStepId
}

// ============================================================================
// 5. TURN CONTRACT & BRANCHED LIFECYCLES (Section F & Step 4)
// ============================================================================

/**
 * Lifecycle states of an overall user request turn.
 * TurnStatus is a set of possible states within non-linear, branched lifecycles:
 * 
 * - CHAT Fast Path:   RECEIVED -> CLASSIFYING -> FINALIZING -> COMPLETED
 * - READ Fast Path:   RECEIVED -> CLASSIFYING -> ROUTING -> EXECUTING -> FINALIZING -> COMPLETED
 * - ACTION Fast Path: RECEIVED -> CLASSIFYING -> ROUTING -> EXECUTING -> FINALIZING -> COMPLETED
 * - QUEST Graph Path: RECEIVED -> CLASSIFYING -> ROUTING -> PLANNING -> EXECUTING -> FINALIZING -> COMPLETED
 * - AMBIGUITY Pause:  RECEIVED -> CLASSIFYING -> NEEDS_CLARIFICATION
 */
export type TurnStatus =
  | "RECEIVED"            // Turn input received at the runtime boundary
  | "CLASSIFYING"         // Intent classifier is determining the ExecutionMode
  | "NEEDS_CLARIFICATION" // Ambiguous intent or missing parameters; paused for user input
  | "ROUTING"             // Capability router is selecting relevant tools
  | "PLANNING"            // Planner is generating an execution graph for QUEST mode
  | "EXECUTING"           // Dispatching read/action/DAG steps
  | "FINALIZING"          // Synthesizing final grounded response
  | "COMPLETED"           // Successfully fulfilled with verified output
  | "FAILED"              // Terminated with an unrecoverable runtime error
  | "CANCELLED"           // Aborted by client or user cancellation

export interface TurnInput {
  readonly text: string
  readonly sessionHistory?: ReadonlyArray<{ readonly role: "user" | "assistant" | "system"; readonly text: string }>
  readonly clientMetadata?: JsonObject
}

export interface Turn {
  readonly id: TurnId
  readonly traceId: TraceId
  readonly input: TurnInput
  readonly executionMode?: ExecutionMode
  readonly status: TurnStatus
  readonly createdAt: number
  readonly completedAt?: number
  readonly error?: RuntimeErrorEnvelope
}

// ============================================================================
// 6. QUEST CONTRACT & LIFECYCLE (Section G)
// ============================================================================

/**
 * Operational lifecycle states for multi-step goals.
 * Persisted across restarts and process boundaries in SQLite (C8).
 */
export type QuestStatus =
  | "CREATED"                   // Quest registered in SQLite
  | "NEEDS_CLARIFICATION"       // Sub-objective requires user disambiguation
  | "WAITING_FOR_CONFIRMATION"  // A step in the quest requires human confirmation
  | "READY"                     // Plan validated and ready for dispatch
  | "RUNNING"                   // DAG executor actively running steps
  | "AWAITING_VERIFICATION"     // All planned steps terminal; awaiting C12 completion verification
  | "PARTIALLY_COMPLETED"       // Some subgoals completed, non-critical branches failed/blocked
  | "COMPLETED"                 // All requested goals verified complete by C12 verifier
  | "BLOCKED"                   // Cannot proceed due to missing external prerequisite
  | "FAILED"                    // Critical failure aborted the entire quest
  | "CANCELLED"                 // Explicitly cancelled by user
  // Backward-compatible persisted aliases:
  | "INITIALIZING"
  | "SUCCEEDED"
  | "SUSPENDED"

export interface Quest {
  readonly id: QuestId
  readonly turnId: TurnId
  readonly traceId: TraceId
  readonly objective: string
  readonly status: QuestStatus
  readonly planId?: PlanId
  readonly createdAt: number
  readonly updatedAt: number
  readonly completedAt?: number
  readonly failureReason?: string
}

// ============================================================================
// 7. PLAN & PLAN STEP CONTRACTS (Sections H & I)
// ============================================================================

/**
 * Step execution states with explicit operational distinctions.
 */
export type StepStatus =
  | "PENDING"                   // Awaiting execution of upstream dependencies
  | "READY"                     // All upstream dependencies satisfied; ready to run
  | "WAITING_FOR_CONFIRMATION"  // Gated by confirmation policy before dispatch
  | "RUNNING"                   // Capability execution in flight
  | "COMPLETED"                 // Execution succeeded and verified
  | "BLOCKED_WITH_REASON"       // Dependency failed or external prerequisite missing
  | "FAILED_RETRYABLE"          // Transient failure; controlled retry within budget permitted
  | "FAILED_FINAL"              // Unrecoverable failure; branch cannot continue automatically
  | "UNKNOWN_COMMIT"            // Side effect may have executed externally, but outcome unconfirmed
  | "CANCELLED"                 // Step cancelled due to upstream failure or user abort
  // Backward-compatible aliases:
  | "SUCCEEDED"                 // Alias for COMPLETED in initial C8 implementation
  | "SKIPPED"                   // Alias for CANCELLED/BLOCKED in initial C8 implementation

/**
 * Normalizes any step status (including legacy persisted aliases) into canonical Core V2 StepStatus.
 */
export function normalizeStepStatus(status: StepStatus | string): StepStatus {
  if (status === "SUCCEEDED") return "COMPLETED"
  if (status === "SKIPPED") return "CANCELLED"
  return status as StepStatus
}

/**
 * Normalizes any quest status (including legacy persisted aliases) into canonical Core V2 QuestStatus.
 */
export function normalizeQuestStatus(status: QuestStatus | string): QuestStatus {
  if (status === "INITIALIZING") return "CREATED"
  if (status === "SUCCEEDED") return "COMPLETED"
  if (status === "SUSPENDED") return "BLOCKED"
  return status as QuestStatus
}

export function isStepSuccessful(status: StepStatus | string): boolean {
  return status === "COMPLETED" || status === "SUCCEEDED"
}

export function isQuestSuccessful(status: QuestStatus | string): boolean {
  return status === "COMPLETED" || status === "SUCCEEDED"
}

export interface PlanStep {
  readonly id: PlanStepId
  readonly objective: string
  readonly capabilityId: CapabilityId
  readonly arguments: JsonObject
  readonly dependsOn: ReadonlyArray<PlanStepId>
  readonly status: StepStatus
  readonly completionCriteria?: string
  readonly error?: RuntimeErrorEnvelope
  readonly startedAt?: number
  readonly completedAt?: number
}

export interface Plan {
  readonly id: PlanId
  readonly questId: QuestId
  readonly traceId: TraceId
  readonly objective: string
  readonly version: number
  readonly steps: ReadonlyArray<PlanStep>
  readonly createdAt: number
}

// ============================================================================
// 8. ACTION CLASSIFICATION (Section J)
// ============================================================================

/**
 * Standard classification for safety, authorization, and confirmation gates (C4).
 */
export type ActionClass =
  | "READ_ONLY"        // Idempotent reads; no state changes (e.g. search, list, readNote)
  | "LOCAL_CREATE"     // Mutates local SQLite data (e.g. createTask, saveMemory)
  | "LOCAL_UPDATE"     // Modifies existing local records (e.g. updateTask)
  | "LOCAL_DELETE"     // Permanently deletes local records (e.g. deleteTask)
  | "EXTERNAL_CREATE"  // Creates remote entity (e.g. createCalendarEvent, createGithubIssue)
  | "EXTERNAL_UPDATE"  // Modifies remote entity (e.g. updateCalendarEvent)
  | "EXTERNAL_SEND"    // Irreversible outbound communication (e.g. sendGmail, sendTelegram)
  | "EXTERNAL_DELETE"  // Deletes remote entity (e.g. deleteCalendarEvent)
  | "SYSTEM_ACTION"    // Interacts with OS-level settings, tokens, or sidecars

// ============================================================================
// 9. CONFIRMATION VOCABULARY (Section K)
// ============================================================================

/**
 * Runtime state vocabulary for the central confirmation gate (C4).
 */
export type ConfirmationState =
  | "NOT_REQUIRED"  // Action is safe to execute autonomously
  | "REQUIRED"      // Policy requires explicit human consent before execution
  | "WAITING"       // Confirmation request has been presented to the user; awaiting response
  | "CONFIRMED"     // User confirmed execution with valid token
  | "REJECTED"      // User explicitly rejected execution
  | "EXPIRED"       // Confirmation window elapsed without user response

// ============================================================================
// 10. OPERATION & IDEMPOTENCY VOCABULARY (Section L & Step 5)
// ============================================================================

/**
 * Lifecycle states of an operation in the persistent operation ledger (C5).
 * Note: Provides logical deduplication and replay protection, with UNKNOWN_COMMIT
 * handling for unverifiable external mutations. Universal "exactly-once" execution
 * is impossible across remote networks; UNKNOWN_COMMIT represents uncertain remote commit.
 */
export type OperationStatus =
  | "PENDING"         // Operation registered in ledger; dispatch in progress
  | "SUCCEEDED"       // Confirmed executed with cached result
  | "FAILED"          // Execution threw known error; record preserved for debugging
  | "UNKNOWN_COMMIT"  // External timeout/disconnection occurred; mutation outcome unverified

/**
 * Inherent idempotency category of a capability.
 */
export type IdempotencyClass =
  | "READ_ONLY"                       // Naturally side-effect free
  | "NATURALLY_IDEMPOTENT"            // Repeats produce identical state (e.g. PUT/upsert, delete by ID)
  | "LEDGER_REQUIRED"                 // Local mutation requiring dedupeKey cache to prevent duplicates
  | "REMOTE_IDEMPOTENCY_SUPPORTED"    // Remote API accepts client-provided idempotency keys
  | "NON_IDEMPOTENT_EXTERNAL"         // Remote API creates duplicate on repeat (e.g. raw email/chat send)
  | "UNKNOWN"                         // Unaudited capability behavior

// ============================================================================
// 11. CAPABILITY AVAILABILITY (Section M)
// ============================================================================

/**
 * Health and configuration state of a capability.
 */
export type CapabilityAvailability =
  | "AVAILABLE"       // Ready to execute immediately
  | "REQUIRES_AUTH"   // API token or OAuth refresh required
  | "UNCONFIGURED"    // Required base URL, vault path, or account credentials missing
  | "DEGRADED"        // Service experiencing rate limits, high latency, or partial failures
  | "DISABLED"        // Explicitly disabled by user preference or feature flag
  | "UNAVAILABLE"     // Target sidecar, server, or binary is offline or unreachable

// ============================================================================
// 12. PROVIDER ROLES (Section N)
// ============================================================================

/**
 * Specialized model roles for provider routing.
 * Note: The Executor is deterministic application code, NOT a model role.
 */
export type ProviderRole =
  | "CHAT"             // Fast conversational interaction and clarification
  | "ACTION_RESOLVER"  // Model specialized in argument extraction for direct mutations
  | "PLANNER"          // Structured DAG reasoning and goal decomposition
  | "REPLANNER"        // Dynamic branch recovery and sub-graph replanning
  | "FINALIZER"        // Grounded outcome synthesis from ledger and step results

// ============================================================================
// 13. RUNTIME ERROR TAXONOMY (Section P)
// ============================================================================

/**
 * High-level error classifications at the core runtime boundary.
 * Granular capability errors (AUTH_REQUIRED, RATE_LIMITED, etc.) belong to C3.
 */
export type RuntimeErrorKind =
  | "VALIDATION"   // Malformed input payload or schema mismatch
  | "POLICY"       // Action blocked by confirmation policy or safety rule
  | "CAPABILITY"   // Tool execution threw or returned error
  | "PROVIDER"     // Upstream AI model timeout, cooldown, or API outage
  | "TIMEOUT"      // Request exceeded global turn deadline or UX budget
  | "CANCELLED"    // Operation was aborted
  | "INTERNAL"     // Unhandled runtime invariant failure

export interface RuntimeErrorEnvelope {
  readonly kind: RuntimeErrorKind
  readonly message: string
  readonly code?: string
  readonly retryable: boolean
  readonly details?: JsonObject
}

// ============================================================================
// 14. COMPONENT INTERFACES (Section Q)
// ============================================================================

/**
 * Component interface: Intent Classification
 */
export interface IntentClassifier {
  classify(input: TurnInput, context?: TraceContext): Promise<ClassificationOutcome>
}

/**
 * Component interface: Capability Routing
 */
export interface CapabilityRouter {
  route(input: TurnInput, context?: TraceContext): Promise<{
    readonly selectedCapabilities: ReadonlyArray<CapabilityId>
    readonly fallbackApplied: boolean
    readonly domainHints: ReadonlyArray<string>
  }>
}

/**
 * Component interface: Structured Planner
 */
export interface Planner {
  plan(input: {
    readonly objective: string
    readonly availableCapabilities: ReadonlyArray<CapabilityId>
    readonly contextNotes?: string
  }, context?: TraceContext): Promise<Plan>
}

/**
 * Component interface: Plan Validator
 */
export interface PlanValidator {
  validate(plan: Plan, context?: TraceContext): Promise<{
    readonly valid: boolean
    readonly errors?: ReadonlyArray<string>
  }>
}

/**
 * Component interface: Quest / DAG Executor
 */
export interface QuestExecutor {
  execute(quest: Quest, plan: Plan, context?: TraceContext): Promise<{
    readonly updatedQuest: Quest
    readonly stepResults: Record<string, JsonValue>
  }>
}

/**
 * Component interface: Completion Verifier
 */
export interface CompletionVerifier {
  verify(quest: Quest, plan: Plan, stepResults: Record<string, JsonValue>, context?: TraceContext): Promise<{
    readonly satisfied: boolean
    readonly missingGoals?: ReadonlyArray<string>
    readonly explanation?: string
  }>
}

/**
 * Component interface: Response Finalizer
 */
export interface Finalizer {
  finalize(input: {
    readonly turn: Turn
    readonly quest?: Quest
    readonly plan?: Plan
    readonly stepResults?: Record<string, JsonValue>
  }, context?: TraceContext): Promise<{
    readonly responseText: string
  }>
}

// ============================================================================
// 15. TURN CONTROLLER BOUNDARY (Section R)
// ============================================================================

export type TurnEvent =
  | { readonly type: "turn_started"; readonly turnId: TurnId; readonly mode?: ExecutionMode }
  | { readonly type: "status_changed"; readonly turnId: TurnId; readonly status: TurnStatus }
  | { readonly type: "quest_updated"; readonly questId: QuestId; readonly status: QuestStatus }
  | { readonly type: "step_progress"; readonly stepId: PlanStepId; readonly status: StepStatus }
  | { readonly type: "clarification_needed"; readonly prompt: string; readonly options?: ReadonlyArray<string> }
  | { readonly type: "confirmation_needed"; readonly prompt: string; readonly action: string }
  | { readonly type: "content_delta"; readonly text: string }
  | { readonly type: "turn_finished"; readonly turnId: TurnId; readonly finalResponse: string }

export interface TurnResult {
  readonly turn: Turn
  readonly quest?: Quest
  readonly plan?: Plan
  readonly finalResponse: string
}

/**
 * Transport-independent entry point for Jarvis Core V2.
 * Can be driven headlessly in tests, or wired to Next.js API route / SSE stream via an adapter.
 */
export interface TurnController {
  processTurn(
    input: TurnInput,
    onEvent?: (event: TurnEvent) => void,
    signal?: AbortSignal,
  ): Promise<TurnResult>
}
