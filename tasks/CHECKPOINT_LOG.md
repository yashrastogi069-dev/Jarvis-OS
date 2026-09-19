# Jarvis Core V2 Checkpoint Log

Authoritative chronological ledger of validated checkpoints for Jarvis Core V2.

---

## C0 — Repository Truth & Baseline Reconciliation

- **Date**: 2026-09-19
- **Branch**: `jarvis-core-v2`
- **Start HEAD**: `cf8dda2`
- **End HEAD**: `79b53bb`
- **Status**: PASS

### Changes
- Reconciled Next.js version to **16.2.6** (React 19.2.4) and canonical package manager to **`pnpm`** (v9.0 lockfile, workspace security overrides).
- Reconciled 60-scenario orchestration benchmark numbers:
  - Architecture A (Baseline ToolLoopAgent): 31.67% full completion, 53.33% premature termination, 21.67% hallucinated success.
  - Architecture B (Loop + Verifier): 96.67% full completion, 33,694 tokens/turn ($5.37/1k turns).
  - Architecture C (DAG Planner-Executor): 88.33% overall, 100.0% on executable tasks, 0.00% premature termination, 0.00% hallucinations, 3,187 tokens/turn (-86.2%), 660ms p50 latency.
- Reconciled capability counts: 47 registered tools across 12 groups, 4 unexposed candidate functions in `lib/skills.ts`, background functions, and disabled connectors.
- Initialized canonical governance files: `tasks/ACTIVE_PLAN.md`, `tasks/DECISIONS.md` (ADRs 001–005), `tasks/KNOWN_ISSUES.md` (ISSUE-001 through ISSUE-006), and `JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md`.

### Verification
- `pnpm typecheck`: PASS (0 errors)
- `pnpm test`: PASS (6 test files, 35 tests)
- `pnpm build`: PASS (Turbopack, TypeScript, 28 dynamic routes)

### Review
- Verified that V1 runtime in `lib/` is completely untouched.
- Clean working tree, zero uncommitted secrets.

### Commit & Push
- **Commit**: `79b53bb` (*"docs(c0): complete Checkpoint C0 repository truth and baseline reconciliation"*)
- **Push**: `origin/jarvis-core-v2` (verified: YES)

---

## C1 — Foundation Domain Types & Runtime Contracts

- **Date**: 2026-09-19
- **Branch**: `jarvis-core-v2`
- **Start HEAD**: `79b53bb`
- **End HEAD**: `8b0ca8e` (and amendment commit)
- **Status**: PASS

### Changes
- Created `lib/jarvis-core/types.ts` establishing shared vocabulary:
  - Strong branded string IDs (`TraceId`, `TurnId`, `QuestId`, `PlanId`, `PlanStepId`, `CapabilityId`, `ToolCallId`, `OperationId`).
  - Minimal JSON-safe primitives (`JsonPrimitive`, `JsonValue`, `JsonObject`).
  - Execution modes (`CHAT`, `READ`, `ACTION`, `QUEST`) representing resolved execution paths.
  - Ambiguity modeled explicitly via `ClassificationOutcome` (`resolved` vs `needsClarification`) rather than an execution mode.
  - Branched `TurnStatus` lifecycle supporting fast paths (`CHAT`, `READ`, `ACTION`) and graph path (`QUEST`).
  - `QuestStatus` lifecycle and entity contract designed for SQLite persistence (C8).
  - `Plan` and `PlanStep` contracts with operational failure isolation (`FAILED_RETRYABLE`, `FAILED_FINAL`, `UNKNOWN_COMMIT`, `BLOCKED_WITH_REASON`).
  - Shared `ActionClass`, `ConfirmationState`, `OperationStatus`, and `IdempotencyClass` vocabularies.
  - `CapabilityAvailability` states and `ProviderRole` definitions (Executor explicitly excluded).
  - Minimal component interfaces (`IntentClassifier`, `CapabilityRouter`, `Planner`, `PlanValidator`, `QuestExecutor`, `CompletionVerifier`, `Finalizer`).
  - Transport-independent `TurnController` boundary.
- Created `tests/jarvis-core/types.test.ts` (14 unit tests covering identities, execution modes, lifecycles, JSON serialization, and framework independence).

### Verification
- `pnpm typecheck`: PASS (0 errors)
- `vitest run tests/jarvis-core/types.test.ts`: PASS (14 tests in 11ms)
- `pnpm test` (full suite): PASS (7 test files, 48 tests)
- `pnpm build` (production build): PASS (Next.js 16.2.6 Turbopack in 34.5s, TypeScript in 28.4s, 28 dynamic API routes)

### Review
- Zero framework imports in `lib/jarvis-core/types.ts` (no React, NextRequest, NextResponse, ToolLoopAgent, or AI SDK stream types).
- Zero premature implementation of C2 (registries), C3 (ToolResult wrappers), C4 (confirmation policies), or C5 (ledger tables).
- V1 runtime in `lib/` remains 100% untouched.

### Deferred
- Items D-001 through D-010 logged in `tasks/DEFERRED.md`.

### Commit & Push
- **Commit**: `8b0ca8e` (*"feat(core-v2): complete Checkpoint C1 domain types and runtime contracts"*) & `33c64ed` (*"docs(core-v2): tighten C1 invariants and checkpoint records"*)
- **Push**: `origin/jarvis-core-v2` (verified: YES)

### Next
- Checkpoint C2: Canonical Capability Registry & Classification (`lib/jarvis-core/capabilities/`) (COMPLETE).

---

## [2026-09-19] Checkpoint C2 — Canonical Capability Registry & Classification
- **Status**: COMPLETE
- **Corpus / Baseline**: 47 registered tools across 12 domains; 4 unexposed candidate skill functions in `lib/skills.ts`.

### Architecture & Implementation
- Created `lib/jarvis-core/capabilities/types.ts`: typed domain vocabulary (12 domains), metadata interfaces (`CapabilityConfirmationMetadata`, `CapabilityIdempotencyMetadata`, `CapabilityRequirements`, `CapabilityAvailabilityMetadata`, `CapabilityRoutingMetadata`), `CapabilityDefinition`, `UnregisteredCandidateInfo`, `RegistryValidationResult`. Zero framework/ToolLoopAgent coupling.
- Created `lib/jarvis-core/capabilities/definitions/`:
  - `local.ts`: 18 local capabilities (6 tasks, 4 memory, 3 skills, 1 feed, 3 wake words, 1 preferences).
  - `research.ts`: 2 research capabilities (webSearch, fetchPage).
  - `connectors.ts`: 27 connector capabilities (6 GitHub, 10 Google, 5 Apple, 2 Telegram, 4 Obsidian).
  - `unregistered.ts`: 4 formally classified candidates (`deploySkillToGithub` as NOT_READY/D-011, `deleteSkill` as INTERNAL_ENGINE/D-012, `proposeRefinement` as INTERNAL_ENGINE/D-013, `discoverSkillCandidates` as BACKGROUND/D-014).
  - `index.ts`: canonical aggregator for all 47 definitions.
- Created `lib/jarvis-core/capabilities/registry.ts`: `CapabilityRegistry` class and singleton `capabilityRegistry` with query methods, domain filtering, ActionClass filtering, integrity validation, `toAiSdkTool` adapter, and `getV1CompatibilityTools()` adapter.
- Created `lib/jarvis-core/capabilities/diagnostics.ts`: developer inspection utility reporting capability counts, domain distribution, read-only vs mutation counts, confirmation/idempotency breakdowns, and static auth requirements with zero secret leakage.
- Created `tests/jarvis-core/capabilities.test.ts`: 12 automated unit tests validating registry integrity, 47 unique capabilities, 12 domains, action classes, valid Zod schemas, executable handlers, network isolation, 1:1 V1 compatibility with `allTools`, candidate classifications, and framework decoupling.

### Verification
- `pnpm typecheck` (`tsc --noEmit`): PASS (0 errors)
- `vitest run tests/jarvis-core/capabilities.test.ts`: PASS (12 tests in 41ms)
- `pnpm test` (full suite): PASS (8 test files, 61 tests, 100% green pass in 26.07s)
- `pnpm build`: PASS (Next.js 16.2.6 Turbopack in 18.2s, TypeScript in 22.3s, 28 dynamic API routes)

### Review
- Zero network calls on import or enumeration.
- Zero coupling to `ToolLoopAgent` in core capability types.
- V1 runtime in `lib/` remains 100% functional and compatible.
- All 4 unexposed skill candidates formally classified with safety rationale and tracked in deferral register.

### Deferred
- Items D-011 (`deploySkillToGithub`), D-012 (`deleteSkill`), D-013 (`proposeRefinement`), D-014 (`discoverSkillCandidates`) logged in `tasks/DEFERRED.md`.

### Commit & Push
- **Commit**: `69c4346` (*"feat(core-v2): add canonical capability registry"*)
- **Push**: `origin/jarvis-core-v2` (verified: YES)

### Next
- Checkpoint C3: Structured ToolResult Boundary (`lib/jarvis-core/capabilities/result.ts`, `safe-boundary.ts`). (COMPLETE)

---

## [2026-09-19] Checkpoint C3 — Structured Capability Result, Error Normalization & Safe Execution Boundary
- **Status**: COMPLETE
- **Corpus / Baseline**: 47 registered capabilities across 12 domains; all 47 verified through boundary.

### Architecture & Implementation
- Created `lib/jarvis-core/capabilities/result.ts`:
  - `CapabilityResult<T>` discriminated union (`CapabilitySuccess<T>` vs `CapabilityFailure`).
  - Strict 14-code semantic error taxonomy (`INVALID_INPUT`, `UNCONFIGURED`, `AUTH_REQUIRED`, `PERMISSION_DENIED`, `NOT_FOUND`, `CONFLICT`, `ALREADY_EXISTS`, `RATE_LIMITED`, `TIMEOUT`, `NETWORK_ERROR`, `SERVICE_UNAVAILABLE`, `CANCELLED`, `UNKNOWN_COMMIT`, `INTERNAL_ERROR`).
  - Context-aware `RetryHint` vocabulary (`DO_NOT_RETRY`, `SAFE_TO_RETRY`, `REQUIRES_POLICY`).
  - Branded execution metadata (`CapabilityExecutionMetadata` with `traceId`, `capabilityId`, `durationMs`, `attempt`).
  - `CapabilityOperationalError` helper class for domain-level typed failure emission.
- Created `lib/jarvis-core/capabilities/json.ts`:
  - `toJsonValue()` deterministic serializer: converts `BigInt` to string, `Date` to ISO string, `NaN`/`Infinity` to null, omits `undefined` properties.
  - Cycle detection using `WeakSet` throwing typed `INTERNAL_ERROR`.
  - Rejection of raw `Error` instances, functions, and symbols in data payloads.
- Created `lib/jarvis-core/capabilities/normalizer.ts`:
  - Comprehensive `sanitizeSecrets()` utility redacting Bearer tokens, GitHub PATs (`ghp_`), Google API keys (`AIzaSy`), Slack tokens (`xoxb-`), Telegram tokens (`bot...`), passwords, and dynamic `process.env` secrets.
  - Semantic `normalizeError()` pipeline classifying Zod validation errors, HTTP status codes (400, 401, 403, 404, 409, 429, 5xx), SQLite constraint collisions, timeouts/aborts, and connector failure strings.
  - Invariant preservation: uncertain external mutations with timeouts or network failures are mapped strictly to `UNKNOWN_COMMIT` with `REQUIRES_POLICY`.
- Created `lib/jarvis-core/capabilities/safe-boundary.ts`:
  - `executeCapabilitySafely<T>()` single-gateway execution boundary.
  - Safe input validation against `inputSchema.safeParse()`.
  - AbortSignal cancellation checks returning `CANCELLED`.
  - Legacy output inspection converting `{ error: string }` returns (e.g. `webSearch`, `fetchPage`) to structured `CapabilityFailure`.
  - Catches all thrown exceptions, formats via `normalizeError`, and logs server-side defects (`[JarvisCore:Defect]`) with sanitized stacks.
- Updated `lib/jarvis-core/capabilities/registry.ts`:
  - `toAiSdkTool()` adapter executes capabilities through `executeCapabilitySafely()`, returning structured error representations rather than throwing unhandled exceptions into the AI SDK agent loop.
  - Added `executeSafely()` method on `CapabilityRegistry` and global convenience export.
- Created `tests/jarvis-core/result-boundary.test.ts`:
  - 39 automated vitest unit tests verifying discriminated unions, all 14 error codes, schema validation, cancellation, JSON serialization, secret redaction, mutation uncertainty, legacy error normalization, domain failures, all 47 capability invocations, AI SDK adapter behavior, <1ms overhead benchmark, and framework decoupling.

### Verification
- `pnpm typecheck` (`tsc --noEmit`): PASS (0 errors)
- `vitest run tests/jarvis-core/`: PASS (3 test files, 65 tests, 100% green)
- `pnpm test` (full repository suite): PASS (9 test files, 100 tests, 100% green)
- `pnpm build`: PASS (Next.js 16.2.6 Turbopack in 17.6s, TypeScript in 22.0s, 28 dynamic API routes)

### Review
- Zero uncaught exceptions escape capability execution.
- V1 runtime in `lib/` remains 100% untouched and functional.
- Zero coupling to React, Next.js, or ToolLoopAgent in core boundary files.
- Overhead benchmark confirms sub-millisecond execution (<1ms/call) through boundary.

### Commit & Push
- **Commit**: `9f150c1` (*"feat(core-v2): add structured capability result boundary"*)
- **Push**: `origin/jarvis-core-v2` (verified: YES)

### Next
- Checkpoint C4: Central Action & Confirmation Policy (`lib/jarvis-core/safety/policy.ts`). (COMPLETE)

---

## [2026-09-19] Checkpoint C4 — Central Action & Confirmation Policy
- **Status**: COMPLETE
- **Corpus / Baseline**: All 47 registered capabilities across 12 domains; destructive/external actions guarded.

### Architecture & Implementation
- Created `lib/jarvis-core/safety/types.ts`:
  - `PolicyDecision` discriminated union (`ALLOW`, `REQUIRE_CONFIRMATION`, `REQUIRE_CLARIFICATION`, `BLOCK`).
  - Branded `ConfirmationToken` type.
  - `ActionPreview` contract specifying `capabilityId`, `targetDomain`, `summary`, structured `details`, and `warning`.
  - `ActionAuthorizationContext` and `AuthorizedExecutionResult<T>` interfaces.
- Created `lib/jarvis-core/safety/canonical.ts`:
  - Deterministic `canonicalizeJson()` sorting keys recursively, preserving array indices, stripping `undefined`.
  - SHA-256 `hashCanonicalArgs()` producing stable cryptographic hashes across any object key ordering.
- Created `lib/jarvis-core/safety/preview.ts`:
  - Pure deterministic preview generator for tasks, memory, wake words, email, telegram, GitHub, Google/Apple calendar, Obsidian, and skills.
  - Hard string truncation (max 150-200 chars) ensuring zero prompt bloat or secret leakage.
- Created `lib/jarvis-core/safety/policy.ts`:
  - `ActionPolicyManager` managing policy matrix, clarification pre-checks, cryptographic token generation (24-byte crypto random, 5-minute TTL, single-use consumption).
  - Clarification precedence: missing or zero target IDs on destructive actions (`tasks.delete`, `memory.delete`) deterministically return `REQUIRE_CLARIFICATION` rather than blind confirmation.
  - Zero model authority: arguments like `{ confirmed: true }` or injected text are ignored by the runtime policy engine.
  - `authorizeAndExecuteCapability()` execution gateway guaranteeing capability handlers NEVER run when unconfirmed or blocked.
- Created `lib/jarvis-core/safety/index.ts`: canonical module exports.
- Created `tests/jarvis-core/safety-policy.test.ts`:
  - 25 automated unit tests covering autonomous ALLOW, confirmation enforcement on all destructive/external capabilities, clarification precedence, model forgery defense, prompt injection immunity, token validation/tampering/replay/expiry/revocation, canonical key ordering, preview fidelity, handler execution boundary isolation, and invalid schema handling.

### Verification
- `pnpm typecheck` (`tsc --noEmit`): PASS (0 errors)
- `vitest run tests/jarvis-core/safety-policy.test.ts`: PASS (25 tests in 36ms)
- `pnpm test` (full repository suite): PASS (10 test files, 125 tests, 100% green)
- `pnpm build`: PASS (Next.js 16.2.6 Turbopack in 17.7s, TypeScript in 27.4s, 28 dynamic API routes)

### Review
- Zero model/prompt authority over action authorization.
- Cryptographic binding between token and exact canonical argument hash.
- Unconfirmed destructive handlers NEVER execute.
- V1 runtime in `lib/` remains 100% functional and untouched.

### Commit & Push
- **Commit**: `1c46622` (*"feat(core-v2): add central action safety policy"*)
- **Push**: `origin/jarvis-core-v2` (verified: YES)

### Next
- Checkpoint C5: Persistent Operation Ledger (`lib/jarvis-core/ledger/`). (COMPLETE)

---

## [2026-09-19] Checkpoint C5 — Persistent Operation Ledger & Logical Idempotency
- **Status**: COMPLETE
- **Corpus / Baseline**: SQLite-backed mutation tracking across all 47 capabilities.

### Architecture & Implementation
- Created `lib/jarvis-core/ledger/types.ts`:
  - `OperationStatus` (`PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED_RETRYABLE`, `FAILED_FINAL`, `UNKNOWN_COMMIT`).
  - Branded `OperationId` and `DedupeKey` types.
  - `OperationRecord`, `OperationClaimResult` discriminated union (`CLAIMED`, `CACHED`, `CONFLICT`, `UNKNOWN_COMMIT`, `FAILED_FINAL`), and options interfaces.
- Created `lib/jarvis-core/ledger/canonical.ts`:
  - `computeDedupeKey()`: deterministic SHA-256 digest scoped by capabilityId, actionClass, idempotencyClass, actor, and canonical input JSON.
  - `hashCanonicalInput()`: stable payload SHA-256 hash.
- Created `lib/jarvis-core/ledger/ledger.ts`:
  - `OperationLedger` class managing the `operations` table and indexes (`idx_operations_dedupe_key`, `idx_operations_status`, `idx_operations_created_at`).
  - `claimOperation()`: atomic SQLite transaction implementing the claim-before-execute pattern, logical idempotency (cached returns for idempotent mutations within window), concurrent execution locking (`CONFLICT`), and unverified mutation protection (`UNKNOWN_COMMIT`).
  - `completeOperation()`: records `SUCCEEDED` status, completion timestamp, and sanitized result payload.
  - `failOperation()`: records `FAILED_RETRYABLE`, `FAILED_FINAL`, or `UNKNOWN_COMMIT` with sanitized error messages.
  - `recoverCrashedOperations()`: boot recovery routine transitioning abandoned `RUNNING`/`PENDING` records to `UNKNOWN_COMMIT` (for external connectors) or `FAILED_RETRYABLE` (for local mutations).
  - `pruneOldOperations()`: cleans up historical operations older than retention threshold while preserving active and recent audit trails.
- Created `lib/jarvis-core/ledger/index.ts`: canonical module exports.
- Created `tests/jarvis-core/operation-ledger.test.ts`:
  - 15 automated unit tests in isolated in-memory SQLite verifying schema initialization, claim/complete lifecycle, idempotent replay, concurrent conflict guards, unknown commit blocking, failure categorization, key stability, crash recovery, quest linkage, secret sanitization, and retention pruning.

### Verification
- `pnpm typecheck` (`tsc --noEmit`): PASS (0 errors)
- `vitest run tests/jarvis-core/operation-ledger.test.ts`: PASS (15 tests in 29ms)
- `vitest run tests/jarvis-core/`: PASS (5 test files, 105 tests, 100% green)
- `pnpm build`: Next.js Turbopack build succeeded, 28 dynamic API routes generated.

### Review
- Atomic SQLite transactions prevent race conditions during concurrent claims.
- UNKNOWN_COMMIT permanently blocks automated retries until explicit resolution.
- V1 runtime in `lib/` remains 100% functional and untouched.

### Commit & Push
- **Commit**: `c43dd13` (*"feat(core-v2): add persistent operation ledger"*)
- **Push**: `origin/jarvis-core-v2` (verified: YES)

### Next
- Checkpoint C6: Intent Analysis & Ambiguity System (`lib/jarvis-core/intent/`). (COMPLETE)

---

## [2026-09-19] Checkpoint C6 — Intent Analysis & Ambiguity System
- **Status**: COMPLETE
- **Corpus / Baseline**: 40-scenario fixed evaluation corpus across conversational, informational, single-capability mutations, multi-step goals, and destructive ambiguity prompts (100% classification accuracy).

### Architecture & Implementation
- Created `lib/jarvis-core/intent/types.ts`:
  - `IntentCategory` union (`CHAT`, `READ`, `MUTATION_SINGLE`, `GOAL_MULTI_STEP`).
  - `AmbiguityType` union (`AMBIGUOUS_TARGET`, `MISSING_REQUIRED_FIELD`, `MULTIPLE_MATCHES`, `CONTRADICTORY_INSTRUCTION`, `UNSPECIFIED_RECIPIENT`).
  - `ClarificationRequest`, `ResolvedIntent`, `ClarificationIntent`, and `IntentAnalysisResult` discriminated unions.
- Created `lib/jarvis-core/intent/ambiguity.ts`:
  - `AmbiguityDetector` detecting underspecified destructive requests missing explicit IDs/titles (tasks, memory, meetings, emails, GitHub issues, Obsidian notes).
  - Enforces Destructive Ambiguity Invariant: returns `AMBIGUOUS_TARGET` or `MISSING_REQUIRED_FIELD` to prevent unintended confirmations.
- Created `lib/jarvis-core/intent/classifier.ts`:
  - `DeterministicFastPathClassifier` with sub-millisecond classification across chat, read-only queries, single mutations, and multi-step conjunctions/action sequences.
- Created `lib/jarvis-core/intent/analyzer.ts`:
  - `IntentAnalyzer` coordinating ambiguity detection, deterministic fast-path classification, and model fallback interfaces with strict confidence thresholds (≥0.75).
- Created `lib/jarvis-core/intent/index.ts`: canonical module exports.
- Created `tests/jarvis-core/intent-analysis.test.ts`:
  - 13 automated test suites verifying conversational detection, read capability matching, single-mutation domain tagging, multi-step goal isolation, destructive deletion ambiguity interception, context-aware clarification resolution, model fallback interfaces, sub-millisecond execution latency (<5ms), and 40-scenario fixed corpus evaluation.

### Verification
- `pnpm typecheck` (`tsc --noEmit`): PASS (0 errors)
- `vitest run tests/jarvis-core/intent-analysis.test.ts`: PASS (13 tests in 23ms)
- `vitest run tests/jarvis-core/`: PASS (6 test files, 118 tests, 100% green)
- `pnpm build`: Next.js Turbopack build succeeded, 28 dynamic API routes generated.

### Review
- Deterministic fast path bypasses LLM latency for predictable queries.
- Destructive actions without unambiguous targets can never proceed to execution without user clarification.
- V1 runtime in `lib/` remains 100% functional and untouched.

### Commit & Push
- **Commit**: Pending
- **Push**: Pending

### Next
- Checkpoint C7: Capability Router & Shadow Evaluation (`lib/jarvis-core/routing/`). (ACTIVE)




