# KNOWN ISSUES & DEFECT LEDGER — JARVIS CORE V2

This document tracks verified defects and architectural risks in the Jarvis repository. Issues are resolved only through architectural guarantees, not cosmetic prompt changes.

---

### ISSUE-001: Unprotected `deleteTask` Exception Crash on Retry / Missing ID
- **Severity**: HIGH
- **Component**: `lib/tasks.ts`, `lib/agent.ts` (`taskTools`)
- **Status**: CONFIRMED & REPRODUCED
- **Description**: Calling `deleteTask` with a non-existent or previously deleted task ID triggers `requireTask(id)`, which throws `new Error(\`Task \${id} not found\`)`. In the current `ToolLoopAgent`, this unhandled exception crashes the execution loop. Furthermore, `deleteTask` possesses ZERO confirmation protection, allowing the model to permanently destroy tasks on a single turn without user consent.
- **Evidence**: `tests/idempotency_audit.test.ts` line 124, `tests/tool_contracts_audit.test.ts` line 185.
- **Resolution Plan**:
  1. Wrap in `ToolResult<T>` boundary (Checkpoint C3) returning `{ success: false, error: "Task not found", recoverable: true }`.
  2. Register in Central Action Policy (Checkpoint C4) requiring confirmation before hard deletion.

---

### ISSUE-002: Four Skills Capabilities Unregistered in `allTools`
- **Severity**: MEDIUM
- **Component**: `lib/skills.ts`, `lib/agent.ts`
- **Status**: CONFIRMED & REPRODUCED
- **Description**: The skill management functions `deploySkillToGithub`, `deleteSkill`, `proposeRefinement`, and `discoverSkillCandidates` are fully implemented in `lib/skills.ts` with valid schemas and execution logic. However, they were completely omitted from `skillsTools` in `lib/agent.ts` and thus never exposed to the agent.
- **Resolution Plan**: In Checkpoint C2, each of the four unexposed skill capabilities (`deploySkillToGithub`, `deleteSkill`, `proposeRefinement`, `discoverSkillCandidates`) will be formally classified under one of: `USER_FACING`, `INTERNAL_ENGINE`, `BACKGROUND`, `NOT_READY`, or `DEPRECATED`. Only capabilities classified as `USER_FACING` that pass explicit safety and contract verification will be exposed as agent-accessible tools; internal or background functions will remain isolated.

---

### ISSUE-003: Connector Registry `promptHint` Omits 13 Registered Tools
- **Severity**: MEDIUM
- **Component**: `lib/connectors/registry.ts`
- **Status**: CONFIRMED & REPRODUCED
- **Description**: The static prompt hint provided to the agent in `lib/connectors/registry.ts` (`getConnectorToolsHint()`) only lists a fraction of tools when connectors are enabled. Specifically, 13 active tools (including `createCalendarEvent`, `sendGmail`, `createAppleCalendarEvent`, and all Obsidian tools) are missing from the hint string, causing the model to doubt capability availability.
- **Evidence**: Audit report Section 24.3 and diff between `CONNECTOR_REGISTRY[id].toolNames` and `allTools`.
- **Resolution Plan**: Replace static hints with dynamic capability introspection in the Canonical Capability Registry (Checkpoint C2).

---

### ISSUE-004: Lack of Mutation Idempotency Across Core Local Tools
- **Severity**: HIGH
- **Component**: `lib/tasks.ts`, `lib/memory/index.ts`, `lib/wake-words.ts`
- **Status**: CONFIRMED & REPRODUCED
- **Description**: Calling `createTask` or `saveMemory` multiple times with identical payloads produces duplicate database records (`res1.id !== res2.id`), creating duplicate notifications and vector embedding pollution. Conversely, calling `addWakeWord` with an existing phrase throws a raw SQLite `UNIQUE constraint failed` crash instead of gracefully handling the idempotency conflict.
- **Evidence**: Output of `tests/idempotency_audit.test.ts`:
  - `createTask`: `duplicateCreated: true`, risk: HIGH.
  - `saveMemory`: `duplicateCreated: true`, risk: HIGH.
  - `addWakeWord`: `thrownErrorOnDuplicate: "UNIQUE constraint failed"`, risk: MEDIUM.
- **Resolution Plan**: Introduce Runtime-Owned Persistent Operation Ledger (ADR-003, Checkpoint C5) with deterministic `dedupeKey` calculation and deduplication window.

---

### ISSUE-005: Premature Multi-Goal Completion in Baseline ToolLoopAgent
- **Severity**: HIGH
- **Component**: `lib/agent.ts` (`ToolLoopAgent`)
- **Status**: CONFIRMED & REPRODUCED
- **Description**: When given compound requests containing multiple goals (e.g., "Summarize recent unread emails, check my calendar for tomorrow at 2 PM, and create a task for anything urgent"), the V1 agent terminates after satisfying only 1 or 2 goals in 32% of adversarial runs. The model generates polite summary text and the loop terminates because no external runtime entity tracks unsatisfied goals.
- **Evidence**: A/B Orchestration Benchmark (`evals/benchmarks/evaluate_orchestrators.js`): Baseline completed only 17/25 multi-goal scenarios (68%), leaving goals stranded.
- **Resolution Plan**: Implement Persisted Quest Engine (ADR-002, Checkpoint C8) and Terminal Completion Verifier (ADR-005, Checkpoint C12).

---

### ISSUE-006: Latency Tail Outliers on Cold / Overloaded Model Providers
- **Severity**: MEDIUM
- **Component**: `lib/providers.ts`, `lib/agent.ts`
- **Status**: CONFIRMED & REPRODUCED
- **Description**: While median latency on fast local/cloud endpoints is 1.1s (text) and 3.2s (tool-assisted), multi-turn scenarios under provider failovers occasionally balloon to 30–79 seconds. This is caused by sequential timeouts across fallback providers without a global per-turn deadline.
- **Evidence**: Failure isolation audit Section 2 (`run_adversarial_scenarios.mjs`).
- **Resolution Plan**: Implement Provider-Role Router with strict per-role timeout budgets and an enforced global request deadline (15s voice, 30s text) in Checkpoint C14.
