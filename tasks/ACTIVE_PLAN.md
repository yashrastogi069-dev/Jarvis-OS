# ACTIVE EXECUTION PLAN — JARVIS CORE V2

## Current Milestone: Milestone 0 — Repository Truth, Substrate Hardening & Core Architecture Baseline
## Current Checkpoint: C1 — Foundation Domain Types & Runtime Contracts (COMPLETE)

---

### Checkpoint C0 Specification (COMPLETE)
- **Objective**: Single source of truth reconciliation, baseline verification, and governance file initialization.
- **Status**: COMPLETE (C0 Amendment executed; Next.js 16.2.6 & pnpm confirmed; orchestration benchmark reconciled; capability inventory categorized; ADRs 001–005 recorded).

---

### Checkpoint C1 Specification (COMPLETE)
- **Objective**: Establish the smallest stable, transport-independent type system and component boundaries (`lib/jarvis-core/types.ts`) without premature implementation of C2–C5.
- **Files Created/Modified**:
  - `lib/jarvis-core/types.ts` (Domain types, lifecycles, and component interfaces)
  - `tests/jarvis-core/types.test.ts` (13 unit tests for identities, lifecycles, serialization, framework independence)
- **Tests & Builds Executed**:
  - `pnpm typecheck` (`tsc --noEmit`): 0 errors
  - `vitest run tests/jarvis-core/types.test.ts`: 13 passed in 15ms
  - `pnpm test` (full suite): 7 test files, 48 tests, 100% green pass in 19.64s
  - `pnpm build` (production build): Next.js 16.2.6 Turbopack (34.5s), TypeScript (28.4s), 28 routes green
- **Acceptance Criteria**: ALL 20 ACCEPTANCE GATES SATISFIED.
- **Status**: COMPLETE.
- **Next Checkpoint**: C2 — Canonical Capability Registry & Classification (QUEUED — Awaiting User Directive).

---

## Queued Roadmap: Checkpoints C2 through C23

### Phase 1: Core Substrate & Capability Registry (Checkpoints C2 – C5)
- [x] **C1: Jarvis Core V2 Domain Types & Runtime Interfaces (COMPLETE)**
- [ ] **C2: Canonical Capability Registry & Classification (QUEUED)**
  - Path: `lib/jarvis-core/capabilities/`
  - Single registry for 47 registered tools; formal classification of 4 unexposed skill candidates (`deploySkillToGithub`, `deleteSkill`, `proposeRefinement`, `discoverSkillCandidates`) as `USER_FACING`, `INTERNAL_ENGINE`, `BACKGROUND`, `NOT_READY`, or `DEPRECATED`. Only verified `USER_FACING` tools become agent-accessible.
- [ ] **C3: Structured ToolResult Boundary**
  - Path: `lib/jarvis-core/capabilities/result-boundary.ts`
  - Catches all exceptions, formats standardized `{ success, data, error, metadata, retryable }` envelopes, prevents raw stack crashes.
- [ ] **C4: Central Action & Confirmation Policy**
  - Path: `lib/jarvis-core/safety/policy.ts`
  - Runtime-enforced gate for dangerous operations (`deleteTask`, external sends, irreversible mutations) with confirmed tokens.
- [ ] **C5: Persistent Operation Ledger**
  - Path: `lib/jarvis-core/ledger/`
  - SQLite-backed mutation tracking with idempotency keys (`dedupeKey`), execution status, and payload deduplication.

### Phase 2: Intent, Routing & Quest Engine (Checkpoints C6 – C8)
- [ ] **C6: Intent Analysis & Ambiguity System**
  - Path: `lib/jarvis-core/intent/`
  - Deterministic classification: direct answer vs single tool vs multi-step goal vs clarification request.
- [ ] **C7: Capability Router & Pruning (Strategy E Primary Candidate)**
  - Path: `lib/jarvis-core/routing/`
  - Evaluated in shadow mode against `evals/corpora/routing_corpus_227.json`; requires ≥99% capability recall, fail-open fallback on low confidence, with ≤12 tools as heuristic target rather than absolute invariant.
- [ ] **C8: Persisted Quest Engine**
  - Path: `lib/jarvis-core/quest/`
  - SQLite table `quests` tracking root goals, active subgoals, status, dependencies, and execution history across sessions.

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
