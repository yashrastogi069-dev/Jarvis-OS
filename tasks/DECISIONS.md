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

## ADR-002: Persisted Quest Engine for Multi-Step Goals
- **Status**: ACCEPTED
- **Date**: 2026-09-19
- **Context**: V1 relies on Vercel AI SDK `ToolLoopAgent` with an in-memory message history and `maxSteps=12`. Empirical benchmarking revealed an 8/25 (32%) failure rate on multi-goal prompts due to premature termination (the model answers conversational pleasantries after step 1 and drops remaining subgoals). In-memory agent loops lose state on process restarts, crashes, or timeout interruptions.
- **Decision**: Introduce a SQLite-backed `quests` and `subgoals` state machine in `lib/jarvis-core/quest/`. Every complex user objective is decomposed into an explicit Quest with discrete SubGoals. Execution progress, dependencies, and statuses (`pending`, `in_progress`, `completed`, `failed`) are persisted to SQLite at each step transition. Completion is verified deterministically before final response synthesis.
- **Consequences**:
  - *Positive*: Complete resistance to premature completion; tasks resume cleanly across app restarts or crashes; explicit auditability of what completed and what failed.
  - *Negative*: Requires SQLite schema migration and minimal overhead per step transition.

---

## ADR-003: Runtime-Owned Persistent Operation Ledger (Logical Deduplication, Replay Protection & UNKNOWN_COMMIT Handling)
- **Status**: ACCEPTED
- **Date**: 2026-09-19
- **Context**: Empirical audit showed `createTask` and `saveMemory` create duplicate records upon LLM retry or failover. Furthermore, `deleteTask` throws unhandled crashes on non-existent IDs. Prompt instructions ("do not create duplicates") are probabilistic and fail under model failovers or retry loops. Universal "exactly-once" execution across distributed networks is theoretically impossible due to potential network partitions where a remote service commits but the acknowledgement is dropped.
- **Decision**: Implement a runtime-owned `operations` ledger in SQLite (`lib/jarvis-core/ledger/`). Every mutating capability call generates a deterministic `dedupeKey` (hash of actor, target domain, action, normalized parameters, and time window). The runtime checks the ledger before dispatching mutations:
  1. *Local Mutations*: Strictly guarded against duplicate execution via the ledger and SQLite transactions.
  2. *External Mutations*: If an unacknowledged timeout or disconnection occurs, the operation is flagged as `UNKNOWN_COMMIT` rather than falsely reported as succeeded or failed, preventing unverified automated retries.
  3. *Replays*: If an identical operation is already recorded as `succeeded`, the cached result is returned without re-invoking the external connector.
- **Consequences**:
  - *Positive*: Hard architectural guarantee against duplicate local mutations and duplicate API calls on retries; explicit handling of uncertain remote side effects.
  - *Negative*: Ledger entries must be indexed and garbage-collected periodically; mutation tools must declare parameter normalization rules.

---

## ADR-004: Capability Routing Strategy (Primary Candidate: Strategy E, Subject to C7 Evaluation)
- **Status**: PROVISIONAL (Primary Candidate subject to C7 evaluation)
- **Date**: 2026-09-19
- **Context**: Jarvis has 47 registered tools across 12 logical capability groups (Tasks, Memory, Research, Voice, Feed, Skills, Preferences, Google, GitHub, Apple, Obsidian, Telegram). Passing all 47 schemas in every prompt causes tool confusion, parameter hallucinations, increased token cost, and latency outliers.
- **Decision**: Adopt Strategy E (hybrid deterministic domain classifier + vector semantic search) as the primary capability routing candidate in `lib/jarvis-core/routing/`, subject to formal evaluation in Checkpoint C7. The routing mechanism must:
  1. Run in shadow mode first to validate routing accuracy against `evals/corpora/routing_corpus_227.json`.
  2. Target **≥99.5% required-capability recall** on the fixed corpus, and **100% recall** on known regression cases.
  3. Include a fail-open fallback to broader tool/domain sets whenever routing confidence is below threshold.
  4. Explicitly recognize: *The fail-open fallback is the reliability mechanism. Benchmark recall is a quality metric, not an assumption of perfect classification.*
  5. Treat "≤12 tools" as a heuristic optimization target, not an absolute correctness invariant.
- **Consequences**:
  - *Positive*: Substantially reduces token payload per turn, eliminates cross-domain parameter hallucinations, and lowers step latency.
  - *Negative*: Risk of pruning necessary tools on low confidence queries, mitigated by fail-open fallback and intent clarification.

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
  - *Negative*: Adds planner step latency for complex goals; simple one-turn requests must bypass the DAG planner via a Fast Path (ADR-006).
