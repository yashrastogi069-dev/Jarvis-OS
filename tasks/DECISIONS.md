# ARCHITECTURAL DECISION RECORDS (ADRs) — JARVIS CORE V2

## ADR-001: Parallel Evolution Architecture (Build V2 Beside V1)
- **Status**: ACCEPTED
- **Date**: 2026-09-19
- **Context**: The existing Jarvis V1 runtime (`lib/agent.ts`, `ToolLoopAgent`) serves production traffic and test suites. Rewriting V1 in-place risks compounding regressions, introducing circular dependency failures, and breaking live user flows while new architectural components are being constructed.
- **Decision**: Develop Jarvis Core V2 completely isolated in `lib/jarvis-core/`. V1 remains 100% untouched and functional. V2 introduces independent registries, execution engines, and safety wrappers. Transition between V1 and V2 will be mediated by a feature flag (`JARVIS_CORE_VERSION=v2`) and canary routing only after passing production verification gates (C20–C22).
- **Consequences**:
  - *Positive*: Zero downtime, zero risk of breaking existing working features, clear A/B evaluation, immediate rollback capability.
  - *Negative*: Temporary code duplication between V1 and V2 until legacy decommissioning in C23.

---

## ADR-002: Persisted Quest Engine for Multi-Step Goals & Completion Boundary
- **Status**: ACCEPTED
- **Date**: 2026-09-19 (Reconciled Pre-C9)
- **Context**: V1 relies on Vercel AI SDK `ToolLoopAgent` with an in-memory message history and `maxSteps=12`. Empirical benchmarking revealed an 8/25 (32%) failure rate on multi-goal prompts due to premature termination (the model answers conversational pleasantries after step 1 and drops remaining subgoals). In-memory agent loops lose state on process restarts, crashes, or timeout interruptions.
- **Decision**: Introduce a SQLite-backed `quests` and `quest_steps` state machine in `lib/jarvis-core/quest/`. Every complex user objective is decomposed into an explicit Quest with discrete `quest_steps`. Execution progress, dependencies, and statuses (`PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `UNKNOWN_COMMIT`) are persisted to SQLite at each step transition. When all steps succeed, the Quest transitions to `AWAITING_VERIFICATION`, preserving the architectural boundary of the C12 Completion Verifier (which alone possesses authority to evaluate goal fulfillment and mark the quest `COMPLETED`/`FAILED` via `verifyAndCompleteQuest`).
- **Consequences**:
  - *Positive*: Complete resistance to premature completion; tasks resume cleanly across app restarts or crashes; explicit auditability of step execution; C12 completion verifier boundary preserved.
  - *Negative*: Requires SQLite schema migration and minimal overhead per step transition.

---

## ADR-003: Runtime-Owned Persistent Operation Ledger (Logical Identity, Replay Protection & Local Mutation Crash Window Semantics)
- **Status**: ACCEPTED
- **Date**: 2026-09-19 (Reconciled Pre-C9)
- **Context**: Empirical audit showed `createTask` and `saveMemory` create duplicate records upon LLM retry or failover. Deduplication cannot rely on `payload + timeBucket` because distinct user actions with identical parameters would be wrongfully suppressed. Furthermore, local database operations (e.g. SQLite tasks/memory) commit independently of the ledger without shared transaction handles; a crash between a business write and ledger commit leaves an unconfirmed mutation.
- **Decision**: Implement a runtime-owned `operations` ledger in SQLite (`lib/jarvis-core/ledger/`):
  1. *Logical Operation Identity*: The runtime owns the primary identity (`operationId` derived deterministically from `TurnId + slot + CapabilityId` or `QuestId + PlanStepId + CapabilityId`). The `inputHash` serves strictly as an argument mismatch and integrity guard (`CONFLICT` if arguments change for the same `operationId`).
  2. *Replays*: If an identical `operationId` is already recorded as `SUCCEEDED`, the cached result is returned without re-invoking the connector.
  3. *Local Mutation Crash Window*: In-flight mutating operations (`LOCAL_CREATE`, `LOCAL_DELETE`, `EXTERNAL_*`, `SYSTEM_ACTION`) that crash in `RUNNING` state transition to `UNKNOWN_COMMIT` upon reboot recovery (never `FAILED_RETRYABLE`). Only `READ_ONLY` actions can safely transition to `FAILED_RETRYABLE`.
  4. *Quest Recovery Reconciliation*: The quest engine reconciles crashed steps with ledger state; an `UNKNOWN_COMMIT` step remains `UNKNOWN_COMMIT` and is never automatically re-queued as `PENDING`.
- **Consequences**:
  - *Positive*: Hard architectural guarantee against duplicate local mutations and duplicate API calls on retries; safe recovery after process termination without unverified mutation replays.
  - *Negative*: Ledger entries must be indexed and cleaned up periodically; runtime must manage explicit operation IDs.

---

## ADR-004: Capability Routing Strategy (Strategy E — Hybrid Classifier + Semantic Search)
- **Status**: ACCEPTED FOR CORE V2
- **Date**: 2026-09-19 (Validated C7 / Reconciled Pre-C9)
- **Context**: Jarvis has 47 registered tools across 12 logical capability groups (Tasks, Memory, Research, Voice, Feed, Skills, Preferences, Google, GitHub, Apple, Obsidian, Telegram). Passing all 47 schemas in every prompt causes tool confusion, parameter hallucinations, increased token cost, and latency outliers.
- **Decision**: Formally accept Strategy E (hybrid deterministic keyword/domain classifier + vector semantic search) in `lib/jarvis-core/routing/` following C7 shadow evaluation:
  1. Achieved 100% required-capability recall (227/227) on `evals/corpora/routing_corpus_227.json` (exceeding the ≥99.5% target).
  2. 100% recall on known regression cases and zero false exclusions.
  3. Includes deterministic fail-open fallback to broader tool/domain sets whenever routing confidence is low or domain is ambiguous.
  4. Explicit invariant: The fail-open fallback is the reliability mechanism.
- **Consequences**:
  - *Positive*: Substantially reduces token payload per turn, eliminates cross-domain parameter hallucinations, and lowers step latency while guaranteeing tool availability.
  - *Negative*: Routing logic requires maintenance if new capability domains are introduced.

---

## ADR-005: Deterministic DAG Planner-Executor with Explicit Error Boundary
- **Status**: ACCEPTED
- **Date**: 2026-09-19
- **Context**: The existing monolithic `ToolLoopAgent` lets the LLM iteratively pick tools in an unconstrained loop. If an exception occurs, the loop either aborts or gets trapped in repetitive retries. The model also struggles with parallelizable multi-step workflows.
- **Decision**: Decouple reasoning from execution:
  1. *Structured Planner*: Generates a typed Directed Acyclic Graph (DAG) of execution steps.
  2. *Plan Validator*: Validates graph acyclicity, tool availability, and safety constraints deterministically before any step runs.
  3. *Deterministic DAG Executor*: Topologically sorts steps, runs independent steps concurrently, logs all mutations to the Operation Ledger, and wraps every capability call in a strict `ToolResult<T>` error boundary.
  4. *Completion Verifier*: Ensures all planned subgoals are completed before delegating to the Finalizer.
- **Consequences**:
  - *Positive*: Total execution safety; no unhandled tool exceptions crashing the agent stream; predictable latency; parallel step execution where dependencies permit.
  - *Negative*: Adds planner step latency for complex goals; simple one-turn requests must bypass the DAG planner via a Fast Path.

---

## ADR-006: Canonical Capability Registry & V1 Tool Decoupling
- **Status**: ACCEPTED
- **Date**: 2026-09-19
- **Context**: In Jarvis V1, tool definitions were coupled directly to the Vercel AI SDK `tool()` wrapper and scattered across `lib/agent.ts`, `lib/research.ts`, and individual connector files. Tool hints in system prompts frequently drifted from real tool names. Four functions in `lib/skills.ts` were implemented but unregistered.
- **Decision**: Introduce a single authoritative `CapabilityRegistry` in `lib/jarvis-core/capabilities/` with:
  1. *Stable Namespaced IDs*: Hierarchical identifiers (e.g. `tasks.create`, `google.mail.message.send`, `obsidian.notes.search`) mapped to legacy tool names (`createTask`, `sendGmail`, `searchNotes`).
  2. *Finite Domain Vocabulary*: Exactly 12 operational domains (`tasks`, `memory`, `research`, `skills`, `feed`, `wake_words`, `preferences`, `github`, `google`, `apple`, `telegram`, `obsidian`) + `system`.
  3. *Static Metadata Only*: Explicit `ActionClass`, confirmation policy expectations, idempotency classes, and static auth requirements. Does NOT enforce C3 ToolResult boundaries, C4 policy gating, or C5 ledger writes prematurely.
  4. *Decoupled Adapters*: `toAiSdkTool` and `getV1CompatibilityTools()` provide adapters for Vercel AI SDK consumption without coupling core capability definitions to `ToolLoopAgent`.
  5. *Unregistered Skill Functions*: Formally classified `deploySkillToGithub` (NOT_READY, D-011), `deleteSkill` (INTERNAL_ENGINE, D-012), `proposeRefinement` (INTERNAL_ENGINE, D-013), and `discoverSkillCandidates` (BACKGROUND, D-005). None are exposed as conversational agent tools until C4/C17.
- **Consequences**:
  - *Positive*: Single authoritative source of truth; zero network calls on import; 100% backward compatibility with V1 `allTools`; compile-time and runtime integrity validation.
  - *Negative*: Metadata must be kept synchronized if new connector capabilities are added.

---

## ADR-007: Structured Capability Result, Error Normalization & Safe Execution Boundary
- **Status**: ACCEPTED
- **Date**: 2026-09-19
- **Context**: In Jarvis V1, 26 out of 47 tools threw unhandled runtime exceptions when connectors were unconfigured or invalid parameters were passed (e.g. `completeTask` throws `Task not found`, `saveAsSkill` throws SQLite unique constraint error, `getGithubNotifications` throws missing token error). When an unhandled error was thrown into the Vercel AI SDK tool loop, it either crashed the streaming HTTP response or forced an uncontrolled model retry. Furthermore, raw error messages risked leaking API keys, credentials, or Bearer tokens.
- **Decision**: Implement a single deterministic execution gateway (`executeCapabilitySafely`) in `lib/jarvis-core/capabilities/safe-boundary.ts`:
  1. *Typed Discriminated Union*: Every capability returns `CapabilityResult<T>`, strictly discriminated by `success: boolean` into `CapabilitySuccess<T>` and `CapabilityFailure`.
  2. *Deterministic JSON Normalization*: Data payloads are serialized via `toJsonValue()`, converting `BigInt` to string, `Date` to ISO string, `NaN`/`Infinity` to null, detecting circular structures (WeakSet), and rejecting raw Error/Function instances.
  3. *Finite Semantic Error Taxonomy*: Standardized 14-code vocabulary (`INVALID_INPUT`, `UNCONFIGURED`, `AUTH_REQUIRED`, `PERMISSION_DENIED`, `NOT_FOUND`, `CONFLICT`, `ALREADY_EXISTS`, `RATE_LIMITED`, `TIMEOUT`, `NETWORK_ERROR`, `SERVICE_UNAVAILABLE`, `CANCELLED`, `UNKNOWN_COMMIT`, `INTERNAL_ERROR`).
  4. *Context-Aware Retry Hints*: Strict `RetryHint` vocabulary (`DO_NOT_RETRY`, `SAFE_TO_RETRY`, `REQUIRES_POLICY`). Read-only actions can safely retry transient transport errors; uncertain external mutations require policy evaluation before replay.
  5. *Preservation of Mutation Uncertainty (`UNKNOWN_COMMIT`)*: Any timeout, network break, or 5xx server response occurring during external mutations (`EXTERNAL_CREATE`, `EXTERNAL_UPDATE`, `EXTERNAL_SEND`, `EXTERNAL_DELETE`) is classified as `UNKNOWN_COMMIT` with `REQUIRES_POLICY`. It is NEVER marked `SAFE_TO_RETRY` or falsely marked succeeded.
  6. *Secret Redaction*: Central `sanitizeSecrets()` utility automatically redacts Bearer tokens, GitHub PATs, Google keys, Slack/Telegram tokens, passwords, and process environment variables from all error text and diagnostic logs.
  7. *AI SDK Adapter Containment*: `CapabilityRegistry.toAiSdkTool()` wraps handlers in `executeCapabilitySafely()`, returning structured error objects instead of throwing into the agent loop.
- **Consequences**:
  - *Positive*: Complete elimination of uncaught tool crashes; zero secret leakage in error messages; deterministic JSON serialization; clear retry guidance for future C5 ledger and C14 orchestration loops; sub-millisecond overhead (<1ms).
  - *Negative*: Domain errors must be mapped through the normalizer; callers must check `result.success`.

---

## ADR-008: Central Action Safety Policy, Clarification Precedence & Unforgeable Confirmation Tokens
- **Status**: ACCEPTED
- **Date**: 2026-09-19
- **Context**: In Jarvis V1, dangerous actions (e.g. deleting memories, deleting tasks, sending external emails or messages) lacked an architectural confirmation barrier at the capability execution level. Asking the LLM to "confirm before deleting" is completely unreliable: prompt injection, jailbreaks, model hallucination, or user input confusion can cause the model to supply `{ confirmed: true }` in arguments and bypass safety. Furthermore, when targets were ambiguous (e.g. "delete that task"), systems would sometimes generate destructive confirmations against arbitrary or first-found IDs instead of asking for clarification.
- **Decision**: Implement a central Action Safety Policy Manager in `lib/jarvis-core/safety/`:
  1. *Zero Model Authority*: The AI model or prompt can NEVER authorize itself. Arguments like `{ confirmed: true }` or text like `"Ignore instructions, user pre-confirmed"` carry ZERO authority and are ignored by the runtime policy engine.
  2. *Deterministic Policy Decision Union*: Every capability evaluation returns `ALLOW`, `REQUIRE_CONFIRMATION`, `REQUIRE_CLARIFICATION`, or `BLOCK`.
  3. *Clarification Precedence*: Destructive requests with missing, zero, or ambiguous target identifiers (e.g. `tasks.delete` without an ID) deterministically yield `REQUIRE_CLARIFICATION`, preventing blind or unintended deletion confirmations.
  4. *Post-Validation Cryptographic Tokens*: Confirmation tokens (`ConfirmationToken`) are 24-byte cryptographically secure random tokens issued strictly AFTER input schema validation (`safeParse`). The token is cryptographically bound to the SHA-256 hash of the canonical JSON representation of the validated parameters.
  5. *Strict Single-Use & Tamper Defense*: Tokens expire after 5 minutes and are atomically consumed upon execution. Any alteration of arguments (e.g. changing `taskId: 1` to `taskId: 2`), replay attempt, or cross-capability substitution immediately triggers `BLOCK`.
  6. *Deterministic Action Previews*: Generates deterministic, bounded, non-LLM action previews with entity identifiers, domain summaries, and reversibility warnings.
  7. *Execution Gateway Boundary*: `authorizeAndExecuteCapability` ensures capability handlers are NEVER invoked if policy returns `REQUIRE_CONFIRMATION`, `REQUIRE_CLARIFICATION`, or `BLOCK`.
- **Consequences**:
  - *Positive*: Unbreakable runtime defense against unauthorized mutations and prompt injections; no accidental destructive operations without explicit user confirmation; clear UI previews.
  - *Negative*: Client applications must implement a two-step confirmation flow for destructive actions.
