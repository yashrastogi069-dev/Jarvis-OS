# ACTIVE EXECUTION PLAN — JARVIS CORE V2

## Current Milestone: Milestone 0 — Repository Truth, Substrate Hardening & Core Architecture Baseline
## Current Checkpoint: Mega Goal C4–C8 (COMPLETE — C4, C5, C6, C7, C8 & Cross-Checkpoint Integration Gate Verified)
## Next Up: C9 — Structured DAG Planner

---

### Checkpoint C0 Specification (COMPLETE)
- **Objective**: Single source of truth reconciliation, baseline verification, and governance file initialization.
- **Status**: COMPLETE.

---

### Checkpoint C1 Specification (COMPLETE)
- **Objective**: Establish the smallest stable, transport-independent type system and component boundaries (`lib/jarvis-core/types.ts`) without premature implementation of C2–C5.
- **Status**: COMPLETE (C1 & C1 Amendment committed and pushed).

---

### Checkpoint C2 Specification (COMPLETE)
- **Objective**: Create one authoritative, typed representation of everything Jarvis can perform in `lib/jarvis-core/capabilities/`, while preserving V1 behavior and avoiding premature migration of later systems.
- **Files Created**:
  - `lib/jarvis-core/capabilities/types.ts`
  - `lib/jarvis-core/capabilities/definitions/local.ts`
  - `lib/jarvis-core/capabilities/definitions/research.ts`
  - `lib/jarvis-core/capabilities/definitions/connectors.ts`
  - `lib/jarvis-core/capabilities/definitions/unregistered.ts`
  - `lib/jarvis-core/capabilities/definitions/index.ts`
  - `lib/jarvis-core/capabilities/registry.ts`
  - `lib/jarvis-core/capabilities/diagnostics.ts`
  - `tests/jarvis-core/capabilities.test.ts`
- **Status**: COMPLETE.

---

### Checkpoint C3 Specification (COMPLETE)
- **Objective**: Ensure every Jarvis Core V2 capability crosses one deterministic, typed, JSON-safe execution boundary so expected operational failures become structured data instead of thrown exceptions, while unexpected programming defects remain observable and cannot disappear silently.
- **Dependencies**: C1 (`lib/jarvis-core/types.ts`), C2 (`lib/jarvis-core/capabilities/`).
- **Files Created / Modified**:
  - `lib/jarvis-core/capabilities/result.ts` (CapabilityResult, CapabilitySuccess, CapabilityFailure, CapabilityError, 14 error codes, 3 retry hints, operational error class)
  - `lib/jarvis-core/capabilities/json.ts` (Deterministic JSON normalization, sanitization, BigInt/Date conversion, circular detection, Error rejection)
  - `lib/jarvis-core/capabilities/normalizer.ts` (Error normalizer: HTTP status codes, SQLite codes, Zod errors, Abort/Timeout, UNKNOWN_COMMIT distinction, complete secret redaction)
  - `lib/jarvis-core/capabilities/safe-boundary.ts` (executeCapabilitySafely central boundary)
  - `lib/jarvis-core/capabilities/registry.ts` (wired executeCapabilitySafely into toAiSdkTool and registry exports)
  - `tests/jarvis-core/result-boundary.test.ts` (39 comprehensive test cases, 100% green)
- **Tests & Verification**:
  - `pnpm typecheck` (tsc --noEmit) -> 0 errors
  - `vitest run tests/jarvis-core/` -> 3 test files, 65 tests passed (100% green)
  - `pnpm test` -> 9 test files, 100 tests passed (100% green)
  - `pnpm build` -> Next.js Turbopack build succeeded, 28 routes generated
- **Status**: COMPLETE.

### Checkpoint C4 Specification (COMPLETE)
- **Objective**: Central Action Safety Policy & Confirmation Gateway ensuring unforgeable, cryptographically bound tokens, deterministic previews, clarification precedence for ambiguous deletions, and zero model authority.
- **Dependencies**: C1 (`types.ts`), C2 (`capabilities/`), C3 (`safe-boundary.ts`).
- **Files Created / Modified**:
  - `lib/jarvis-core/safety/types.ts` (PolicyDecision union, ConfirmationToken, ActionPreview, ActionAuthorizationContext, AuthorizedExecutionResult)
  - `lib/jarvis-core/safety/canonical.ts` (canonicalizeJson, hashCanonicalArgs)
  - `lib/jarvis-core/safety/preview.ts` (generateActionPreview with deterministic entity previews, domain summaries, warnings)
  - `lib/jarvis-core/safety/policy.ts` (ActionPolicyManager, evaluatePolicy, issueConfirmation, validateAndConsumeToken, authorizeAndExecuteCapability)
  - `lib/jarvis-core/safety/index.ts` (module exports)
  - `tests/jarvis-core/safety-policy.test.ts` (25 automated unit tests, 100% green)
- **Tests & Verification**:
  - `pnpm typecheck` (`tsc --noEmit`) -> 0 errors
  - `vitest run tests/jarvis-core/safety-policy.test.ts` -> 25 passed (100% green)
  - `pnpm test` (full repository test suite) -> 10 test files, 125 passed (100% green)
  - `pnpm build` -> Next.js Turbopack build succeeded, 28 routes generated
- **Status**: COMPLETE.

---

### Checkpoint C5 Specification (COMPLETE)
- **Objective**: Persistent Operation Ledger in SQLite with claim-before-execute pattern, dedupeKey generation, logical idempotency, concurrent execution conflict prevention, UNKNOWN_COMMIT preservation, crash recovery, and retention pruning.
- **Dependencies**: C1 (`types.ts`), C2 (`capabilities/`), C3 (`json.ts`, `normalizer.ts`), C4 (`canonical.ts`).
- **Files Created / Modified**:
  - `lib/jarvis-core/ledger/types.ts` (OperationRecord, OperationStatus, DedupeKey, OperationId, OperationClaimResult)
  - `lib/jarvis-core/ledger/canonical.ts` (computeDedupeKey, hashCanonicalInput)
  - `lib/jarvis-core/ledger/ledger.ts` (OperationLedger, claimOperation, completeOperation, failOperation, recoverCrashedOperations, pruneOldOperations)
  - `lib/jarvis-core/ledger/index.ts` (module exports)
  - `tests/jarvis-core/operation-ledger.test.ts` (15 automated unit tests, 100% green)
- **Tests & Verification**:
  - `pnpm typecheck` (`tsc --noEmit`) -> 0 errors
  - `vitest run tests/jarvis-core/operation-ledger.test.ts` -> 15 passed (100% green)
  - `vitest run tests/jarvis-core/` -> 5 test files, 105 passed (100% green)
  - `pnpm build` -> Next.js Turbopack build succeeded, 28 routes generated
- **Status**: COMPLETE.

---

## Queued Roadmap: Checkpoints C6 through C23

### Phase 1: Core Substrate & Capability Registry (Checkpoints C2 – C5)
- [x] **C1: Jarvis Core V2 Domain Types & Runtime Interfaces (COMPLETE)**
- [x] **C2: Canonical Capability Registry & Classification (COMPLETE)**
- [x] **C3: Structured Capability Result & Safe Execution Boundary (COMPLETE)**
- [x] **C4: Central Action & Confirmation Policy (COMPLETE)**
- [x] **C5: Persistent Operation Ledger (COMPLETE)**

### Phase 2: Intent, Routing & Quest Engine (Checkpoints C6 – C8)
- [x] **C6: Intent Analysis & Ambiguity System (COMPLETE)**
  - Path: `lib/jarvis-core/intent/`
  - Deterministic classification: direct answer vs single tool vs multi-step goal vs clarification request. Destructive ambiguity protection verified on 40-prompt corpus.
- [x] **C7: Capability Router & Shadow Evaluation (COMPLETE - Strategy E)**
  - Path: `lib/jarvis-core/routing/`
  - Evaluated in shadow mode against `evals/corpora/routing_corpus_227.json`; achieved 100.0% tool recall, 0 false exclusions, 6.68 average tools exposed (85.7% token reduction), and fail-open safe fallback.
- [x] **C8: Persisted Quest Engine (COMPLETE)**
  - Path: `lib/jarvis-core/quest/`
  - SQLite tables `quests` and `quest_steps` tracking root goals, active subgoals, status, dependencies, execution history across sessions, and operation ledger linkage. Verified with 13 unit tests.

### Phase 3: Planning, Execution & Verification (Checkpoints C9 – C13)
- [ ] **C9: Structured DAG Planner**
  - Path: `lib/jarvis-core/planner/`
  - Generates validated directed acyclic graph of steps with typed input references.
- [ ] **C10: Plan Validator & Safety Checker**
  - Path: `lib/jarvis-core/planner/validator.ts`
  - Ensures acyclicity, capability existence, schema satisfaction, and policy compliance before any execution.
- [ ] **C11: Deterministic DAG Executor**
  - Path: `lib/jarvis-core/executor/`
  - Topological step execution, parallel dispatch of independent steps, ledger registration, step-level error handling.
- [ ] **C12: Completion Verifier**
  - Path: `lib/jarvis-core/verifier/`
  - Inspects ledger and goal criteria before terminating; prevents premature termination on multi-goal requests.
- [ ] **C13: Controlled Replanner & Error Recovery**
  - Path: `lib/jarvis-core/planner/replanner.ts`
  - Recovers from failed steps with bounded replanning budget (max 2 attempts) rather than blind loop churning.

### Phase 4: Reliability, Providers & Observability (Checkpoints C14 – C16)
- [ ] **C14: Provider-Role Router & UX Deadline Model**
  - Path: `lib/jarvis-core/providers/`
  - Role-based routing (chat, planner, replanner, finalizer) with provisional UX budgets (15s voice, 30s text) and calibrated stage timeouts.
- [ ] **C15: Finalizer & Response Generator**
  - Path: `lib/jarvis-core/finalizer/`
  - Grounded summarization based exclusively on ledger outcomes and tool results.
- [ ] **C16: Structured Progress & Streaming Integration**
  - Path: `lib/jarvis-core/streaming/`
  - Real-time SSE event pipeline for UI progress updates during multi-step quest execution.

### Phase 5: Capability Migration & Hardening (Checkpoints C17 – C19)
- [ ] **C17: Tasks, Memory & Research Capability Migration**
- [ ] **C18: Read-Only Connectors Migration (Google, GitHub, Apple, Obsidian)**
- [ ] **C19: External Mutation Connectors Migration (Gmail Send, Calendar Create, Telegram, Obsidian Write)**

### Phase 6: Production Gate & Cutover (Checkpoints C20 – C23)
- [ ] **C20: Comprehensive V1 vs V2 Evaluation (A/B Benchmark Gate on 60 Scenarios)**
- [ ] **C21: Production Canary & Feature Flag Deployment**
- [ ] **C22: V2 Promoted to Default Agent Runtime**
- [ ] **C23: Legacy V1 Decommissioning & Cleanup**
