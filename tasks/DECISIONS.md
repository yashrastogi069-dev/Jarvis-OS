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

## ADR-003: Runtime-Owned Persistent Operation Ledger (Exact-Once Execution)
- **Status**: ACCEPTED
- **Date**: 2026-09-19
- **Context**: Empirical audit showed `createTask` and `saveMemory` create duplicate records upon LLM retry or failover. Furthermore, `deleteTask` throws unhandled crashes on non-existent IDs. Prompt instructions ("do not create duplicates") are probabilistic and fail under model failovers or retry loops.
- **Decision**: Implement a runtime-owned `operations` ledger in SQLite (`lib/jarvis-core/ledger/`). Every mutating capability call generates a deterministic `dedupeKey` (hash of actor, target domain, action, normalized parameters, and time window). The runtime checks the ledger before dispatching mutations. If an identical operation is already recorded as `succeeded`, the cached result is returned without re-invoking the external connector or DB write.
- **Consequences**:
  - *Positive*: Hard architectural guarantee of idempotency; elimination of duplicate tasks, duplicate calendar invites, and duplicate emails on retry.
  - *Negative*: Ledger entries must be indexed and garbage-collected periodically; mutation tools must declare parameter normalization rules.

---

## ADR-004: Strategy E Capability Routing with Semantic Fallback
- **Status**: ACCEPTED
- **Date**: 2026-09-19
- **Context**: Jarvis has 46+ registered tools across 8 domains (Tasks, Memory, Research, Voice, Google, GitHub, Apple, Obsidian). Passing all 46 schemas in every prompt causes tool confusion, parameter hallucinations, increased token cost, and 30–79s latency outliers on slower reasoning providers.
- **Decision**: Adopt Strategy E (hybrid domain classifier + vector semantic search) in `lib/jarvis-core/routing/`. The incoming user utterance is deterministically mapped to 1–2 target domains (e.g., Google Calendar, GitHub) or searched against capability embedding vectors, pruning the active tool schema surface from 46 down to ≤12 tools per agent invocation.
- **Consequences**:
  - *Positive*: Reduces token payload per step by >60%; eliminates cross-domain tool hallucinations (e.g., calling Apple Calendar when Google was intended); reduces step latency by ~40%.
  - *Negative*: Misrouting could prune a necessary tool. Mitigated by explicit fallback to full domain set if confidence is low, and intent clarification on ambiguous requests.

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
