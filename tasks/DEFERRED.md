# DEFERRED WORK REGISTER — JARVIS CORE V2

This document tracks valuable engineering proposals that are non-essential for the immediate acceptance gates of active checkpoints. Items recorded here are deliberately postponed to preserve architectural clarity, avoid premature optimization, and prevent scope explosion.

> **Permanent Scope-Control Rule**:
> Implement the minimum reliable version required by the active checkpoint. If valuable work is not required for the current acceptance gate, substantially increases complexity, or depends on later architecture, record it in `tasks/DEFERRED.md` rather than implementing it immediately.
> 
> Deferral must NEVER be used to avoid correctness, security, data integrity, mutation safety, or known regression fixes.

---

## D-001 — Advanced Multi-Round Replanning Loops
- **Description**: Expanding the replanner to support dynamic backtracking trees, counterfactual hypothesis generation, and multi-turn conversational negotiation when deep sub-trees fail.
- **Why deferred**: Simple bounded replanning (max 2 attempts on failed branches) satisfies >95% of recovery scenarios. Deep tree-search replanning adds severe latency and token cost without proven reliability gains.
- **Dependency**: C13 (Controlled Replanner).
- **Earliest revisit**: Phase 6 post-migration audit.
- **Trigger/evidence required**: Evidence from evaluation corpus showing >5% of failures are recoverable only via multi-round backtracking.
- **Status**: DEFERRED

---

## D-002 — Aggressive Dynamic DAG Parallelization & Speculative Dispatch
- **Description**: Dispatching read-only steps speculatively before parent decision nodes finish, and dynamically maximizing parallel worker pools.
- **Why deferred**: Bounded topological parallel execution of statically independent steps (C11) provides 80% of concurrency benefits. Speculative execution wastes tokens and complicates error recovery.
- **Dependency**: C11 (Deterministic DAG Executor).
- **Earliest revisit**: Phase 5 performance optimization.
- **Trigger/evidence required**: Wall-clock latency benchmarks demonstrating read steps are the dominant bottleneck (>50% of turn duration).
- **Status**: DEFERRED

---

## D-003 — Sophisticated Adaptive Provider Scoring & Real-Time Cost Arbitrage
- **Description**: Dynamic Thompson-sampling or multi-armed bandit provider routing based on real-time token cost, latency variance, and historical per-capability accuracy.
- **Why deferred**: Deterministic role routing (Chat -> Flash, Planner -> DeepSeek/Reasoning, Finalizer -> Flash) with static fallback chains (C14) is transparent, predictable, and fully debuggable.
- **Dependency**: C14 (Provider-Role Router).
- **Earliest revisit**: Post-V2 production stabilization.
- **Trigger/evidence required**: Provider pricing shifts or high-volume usage where routing arbitrage saves >30% monthly cost.
- **Status**: DEFERRED

---

## D-004 — Deep Memory Substrate Redesign (Hybrid Graph + Vector RAG)
- **Description**: Replacing SQLite memory tables with an integrated knowledge graph, temporal validity intervals, and hierarchical entity extraction.
- **Why deferred**: Existing `sqlite-vec` + keyword hybrid recall in `lib/memory/index.ts` is stable, fast (<10ms), and 100% green in all benchmarks.
- **Dependency**: Phase 7 / Core V2 production gate.
- **Earliest revisit**: Checkpoint C17 (Memory capability migration).
- **Trigger/evidence required**: User complaints or benchmark failures regarding relational entity association in memory recall.
- **Status**: DEFERRED

---

## D-005 — Skill Factory Autonomous Evolution
- **Description**: Automated background synthesis, self-testing, and deployment of user skills without human-in-the-loop review.
- **Why deferred**: Safety hazard. Skill creation and execution must remain human-governed until safety wrappers (C3) and confirmation policies (C4) are battle-tested in production.
- **Dependency**: C4 (Action Confirmation Policy) and C17.
- **Earliest revisit**: Checkpoint C17.
- **Trigger/evidence required**: Formal safety sandbox architecture specification.
- **Status**: DEFERRED

---

## D-006 — Self-Healing Daemon & Sidecar Auto-Restarter
- **Description**: Automatic process supervisor that watches Faster-Whisper, Piper, Ollama, and SQLite health, restarting crashed processes and re-acquiring system ports.
- **Why deferred**: Out-of-process daemon management belongs at the OS layer or in dedicated companion tools (`tools/stt-server/`), not inside the core agent runtime.
- **Dependency**: Phase 7 system connector.
- **Earliest revisit**: Phase 7 polish.
- **Trigger/evidence required**: Unhandled sidecar crashes occurring repeatedly in soak testing.
- **Status**: DEFERRED

---

## D-007 — Interactive 3D Quest DAG HUD Visualizer
- **Description**: Real-time 3D rendering of the active Quest DAG graph inside the Three.js Arc Reactor stage with glowing node states and animated dependency pulses.
- **Why deferred**: Pure UI enhancement. Core V2 must establish rock-solid headless reliability before building complex client-side 3D visualizers.
- **Dependency**: C16 (Structured Progress SSE).
- **Earliest revisit**: Phase 6 frontend integration.
- **Trigger/evidence required**: C16 SSE event pipeline verified and stable in production.
- **Status**: DEFERRED

---

## D-008 — Legacy V1 Decommissioning & Code Cleanup
- **Description**: Complete deletion of `lib/agent.ts`, legacy `ToolLoopAgent` wiring, and obsolete prompt builders.
- **Why deferred**: V1 must remain 100% operational beside V2 throughout the entire migration (C1–C21) to ensure zero downtime, enable continuous A/B benchmarking, and guarantee rollback capability.
- **Dependency**: C23 (Legacy Removal after Confidence Period).
- **Earliest revisit**: Checkpoint C23.
- **Trigger/evidence required**: Successful completion of C21 canary and C22 default cutover with zero regressions for 14 days.
- **Status**: DEFERRED

---

## D-009 — Speculative Tool Pre-fetching
- **Description**: Running speculative read calls (e.g. pre-fetching calendar events or notifications) while the user is actively speaking or typing.
- **Why deferred**: Premature optimization that risks unnecessary API calls, token waste, and rate limit exhaustion.
- **Dependency**: C7 (Capability Router).
- **Earliest revisit**: Post-V2 optimization pass.
- **Trigger/evidence required**: Intent classification latency exceeding 500ms on local hardware.
- **Status**: DEFERRED

---

## D-010 — Dynamic Token Budgeting & Context Pruning Compressor
- **Description**: Real-time summarization and compression of intermediate step outputs using specialized distillation models to minimize context window size.
- **Why deferred**: In Architecture C, step isolation and capability pruning already reduce token consumption by >86% (from 23,119 down to 3,187 tokens). Additional compression adds complexity without necessity.
- **Dependency**: C15 (Finalizer).
- **Earliest revisit**: Phase 5 token discipline review.
- **Trigger/evidence required**: Step outputs consistently exceeding 8,000 tokens on multi-step workflows.
- **Status**: DEFERRED

---

## D-011 — deploySkillToGithub Conversational Tool Exposure
- **Description**: Exposing `deploySkillToGithub` from `lib/skills.ts` as an agent-accessible tool.
- **Why deferred**: Pushes file changes directly to external GitHub repositories via GitHub Contents API. Requires strict repository permission sandboxing and human confirmation policy (C4) before exposure to LLM conversational turns.
- **Dependency**: C4 (Confirmation Policy) & C17 (Skills capability migration).
- **Earliest revisit**: Checkpoint C17.
- **Trigger/evidence required**: C4 confirmation policy engine operational and tested on external mutations.
- **Status**: DEFERRED

---

## D-012 — deleteSkill Conversational Tool Exposure
- **Description**: Exposing `deleteSkill` from `lib/skills.ts` as an agent-accessible tool.
- **Why deferred**: Irreversible local database deletion cascading to `skillRuns`. Currently used only by UI management components. Must be gated by a two-phase confirmation protocol (identical to `deleteMemory`) before LLM agent exposure.
- **Dependency**: C4 (Confirmation Policy) & C17 (Skills capability migration).
- **Earliest revisit**: Checkpoint C17.
- **Trigger/evidence required**: Two-phase preview/approval mechanism implemented for skill deletion.
- **Status**: DEFERRED

---

## D-013 — proposeRefinement Autonomous Optimization Loop
- **Description**: Exposing `proposeRefinement` as an autonomous tool or background cron for automated skill rewriting.
- **Why deferred**: Internal routine of the Skill Factory / Loop Engine optimization pipeline. Designed to be triggered by developer/user UI actions or offline optimization passes, not inline user chat turns.
- **Dependency**: C17 (Skills & Loop Engine).
- **Earliest revisit**: Checkpoint C17.
- **Trigger/evidence required**: Skill evaluation testbed established.
- **Status**: DEFERRED
