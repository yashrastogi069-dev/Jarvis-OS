# ACTIVE EXECUTION PLAN — JARVIS CORE V2

## Current Milestone: Milestone 0 — Repository Truth, Substrate Hardening & Core Architecture Baseline
## Current Checkpoint: C0 — Repository Truth & Documentation Reconciliation

---

### Checkpoint C0 Specification (ACTIVE)
- **Objective**: Establish single source of repository truth, eliminate contradictions between documentation and source code, establish baseline verification (100% clean typecheck and test passes), initialize canonical governance artifacts (`ACTIVE_PLAN.md`, `DECISIONS.md`, `KNOWN_ISSUES.md`, `JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md`), and prepare Checkpoint C1.
- **Dependencies**: None.
- **Files Expected to Change**:
  - `tsconfig.json` (exclude scratch)
  - `tests/idempotency_audit.test.ts` (type cleanup)
  - `tests/tool_contracts_audit.test.ts` (type cleanup)
  - `tests/full-system-audit.test.ts` (cold-start timeout tolerance)
  - `tasks/ACTIVE_PLAN.md` (new canonical plan)
  - `tasks/DECISIONS.md` (ADRs 001–005)
  - `tasks/KNOWN_ISSUES.md` (ISSUE-001 through ISSUE-006)
  - `JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md` (living master report)
  - `JARVIS_BUILD_STATE.md` (updated with C0 status)
  - `HANDOFF.md` (updated operational handoff)
- **Tests Required**:
  - `npm run typecheck` (tsc --noEmit)
  - `npm run test` (vitest run across all suites)
- **Acceptance Criteria**:
  1. Git working branch is `jarvis-core-v2` tracking `origin/jarvis-core-v2`.
  2. `tsc --noEmit` exits with code 0 (zero errors).
  3. All test suites pass.
  4. Audit findings verified against live codebase and documented without assumption.
  5. V1 codebase in `lib/` preserved untouched for production continuity.
  6. Deliverables A through L for Part XLII produced with complete evidence.
- **Risks**:
  - Unsynchronized documentation confusing architectural boundaries.
  - Concurrency locks on SQLite during multi-test execution.
- **Status**: IN PROGRESS (Verification complete; writing governance files and formal report).
- **Next Checkpoint**: C1 — Jarvis Core V2 Domain Types & Runtime Interfaces (`lib/jarvis-core/types.ts`).

---

## Queued Roadmap: Checkpoints C1 through C23

### Phase 1: Core Substrate & Capability Registry (Checkpoints C1 – C5)
- [ ] **C1: Jarvis Core V2 Domain Types & Runtime Interfaces**
  - Path: `lib/jarvis-core/types.ts`
  - Defines `CapabilityDefinition`, `ToolResult<T>`, `Quest`, `SubGoal`, `PlanStep`, `ExecutionGraph`, `OperationRecord`, `ActionConfirmationPolicy`.
- [ ] **C2: Canonical Capability Registry**
  - Path: `lib/jarvis-core/capabilities/`
  - Single registry replacing fragmented maps; metadata-rich, strongly-typed contracts for all 46 tools.
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
- [ ] **C7: Capability Router & Pruning (Strategy E)**
  - Path: `lib/jarvis-core/routing/`
  - Domain and semantic routing selecting top ≤12 relevant capabilities per turn; shadow-mode evaluation against `evals/corpora/routing_corpus_227.json`.
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
- [ ] **C14: Provider-Role Router & Global Deadline Model**
  - Path: `lib/jarvis-core/providers/`
  - Role-based routing (reasoning, fast tools, embeddings), failover chains with global request deadlines (15s voice, 30s text).
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
