# KNOWN ISSUES & DEFECT LEDGER — JARVIS CORE V2

This document tracks verified defects and architectural risks in the Jarvis repository. Issues are resolved only through architectural guarantees, not cosmetic prompt changes.

---

### ISSUE-001: Unprotected `deleteTask` Exception Crash on Retry / Missing ID
- **Severity**: HIGH
- **Component**: `lib/tasks.ts`, `lib/agent.ts` (`taskTools`), `lib/jarvis-core/capabilities/safe-boundary.ts`, `lib/jarvis-core/safety/`
- **Status**: RESOLVED IN V2 (C3 Safe Boundary & C4 Action Policy implemented; V1 runtime remains unsafe until cutover)
- **Description**: Calling `deleteTask` with a non-existent or previously deleted task ID triggers `requireTask(id)`, which throws `new Error(\`Task \${id} not found\`)`. In the current `ToolLoopAgent`, this unhandled exception crashes the execution loop. Furthermore, `deleteTask` possesses ZERO confirmation protection, allowing the model to permanently destroy tasks on a single turn without user consent.
- **Evidence**: `tests/idempotency_audit.test.ts` line 124, `tests/tool_contracts_audit.test.ts` line 185.
- **Resolution Status**:
  1. [x] **Contained in C3**: Safe capability execution boundary (`executeCapabilitySafely`) normalizes missing task errors into `{ success: false, error: { code: "NOT_FOUND", retryHint: "DO_NOT_RETRY" } }` rather than throwing uncaught exceptions. Verified in `tests/jarvis-core/result-boundary.test.ts`.
  2. [x] **Enforced in C4**: Central Action Safety Policy (`lib/jarvis-core/safety/`) requires explicit cryptographically bound confirmation tokens before destructive deletion can run. Missing IDs trigger `REQUIRE_CLARIFICATION`.
  3. [ ] **Pending C14 / C21**: V2 runtime cutover to replace legacy V1 `/api/chat`.

---

### ISSUE-002: Four Skills Capabilities Unregistered in `allTools`
- **Severity**: LOW (Architecturally Reconciled)
- **Component**: `lib/skills.ts`, `lib/jarvis-core/capabilities/definitions/unregistered.ts`
- **Status**: RESOLVED / CLASSIFIED IN C2
- **Description**: The skill management functions `deploySkillToGithub`, `deleteSkill`, `proposeRefinement`, and `discoverSkillCandidates` were implemented in `lib/skills.ts` but omitted from `skillsTools` in `lib/agent.ts`.
- **Resolution**: Formally classified in Checkpoint C2 (`lib/jarvis-core/capabilities/definitions/unregistered.ts`):
  1. `deploySkillToGithub`: Classified `NOT_READY` (requires C4 confirmation & repository sandbox; tracked as D-011).
  2. `deleteSkill`: Classified `INTERNAL_ENGINE` (UI component helper; requires C4 2-phase confirmation before agent exposure; tracked as D-012).
  3. `proposeRefinement`: Classified `INTERNAL_ENGINE` (Loop Engine optimization routine; not an inline agent tool; tracked as D-013).
  4. `discoverSkillCandidates`: Classified `BACKGROUND` (batch discovery routine; tracked as D-014).
  None are exposed to the agent in C2. None pollute the 47 user-facing capabilities.

---

### ISSUE-003: Connector Registry `promptHint` Omits 13 Registered Tools
- **Severity**: MEDIUM
- **Component**: `lib/connectors/registry.ts`, `lib/jarvis-core/capabilities/`, `lib/jarvis-core/routing/`
- **Status**: RESOLVED IN CORE V2 (C2 Canonical Registry & C7 Capability Router)
- **Description**: The static prompt hint provided to the agent in `lib/connectors/registry.ts` (`getConnectorToolsHint()`) only lists a fraction of tools when connectors are enabled. Specifically, 13 active tools (including `createCalendarEvent`, `sendGmail`, `createAppleCalendarEvent`, and all Obsidian tools) are missing from the hint string, causing the model to doubt capability availability.
- **Evidence**: Audit report Section 24.3 and diff between `CONNECTOR_REGISTRY[id].toolNames` and `allTools`.
- **Resolution Plan**: Replaced static hints with dynamic capability introspection in the Canonical Capability Registry (Checkpoint C2) and Capability Router (Checkpoint C7). Legacy V1 hint string remains untouched until V1 decommissioning (D-008).

---

### ISSUE-004: Lack of Mutation Idempotency Across Core Local Tools
- **Severity**: HIGH
- **Component**: `lib/tasks.ts`, `lib/memory/index.ts`, `lib/wake-words.ts`, `lib/jarvis-core/ledger/`
- **Status**: RESOLVED IN CORE V2 (C5 Persistent Operation Ledger; V1 remains unsafe until cutover)
- **Description**: Calling `createTask` or `saveMemory` multiple times with identical payloads produces duplicate database records (`res1.id !== res2.id`), creating duplicate notifications and vector embedding pollution. Conversely, calling `addWakeWord` with an existing phrase throws a raw SQLite `UNIQUE constraint failed` crash instead of gracefully handling the idempotency conflict.
- **Evidence**: Output of `tests/idempotency_audit.test.ts`:
  - `createTask`: `duplicateCreated: true`, risk: HIGH.
  - `saveMemory`: `duplicateCreated: true`, risk: HIGH.
  - `addWakeWord`: `thrownErrorOnDuplicate: "UNIQUE constraint failed"`, risk: MEDIUM.
- **Resolution**: Resolved in Core V2 via Checkpoint C5 (`lib/jarvis-core/ledger/`):
  1. Runtime-owned logical operation identity (`operationId` derived from `TurnId + slot` or `QuestId + PlanStepId`).
  2. Input argument hash integrity guard (`inputHash` mismatch -> `CONFLICT`).
  3. Crash recovery semantics: in-flight mutations transition to `UNKNOWN_COMMIT`, preventing duplicate replays on reboot.

---

### ISSUE-005: Premature Multi-Goal Completion in Baseline ToolLoopAgent
- **Severity**: HIGH
- **Component**: `lib/agent.ts` (`ToolLoopAgent`), `lib/jarvis-core/quest/`
- **Status**: MITIGATED IN CORE V2 FOUNDATION (C8 Persisted Quest Engine; C12 Terminal Completion Verifier pending)
- **Description**: When given compound requests containing multiple goals (e.g., "Summarize recent unread emails, check my calendar for tomorrow at 2 PM, and create a task for anything urgent"), the V1 agent terminates after satisfying only 1 or 2 goals in 32% of adversarial runs. The model generates polite summary text and the loop terminates because no external runtime entity tracks unsatisfied goals.
- **Evidence**: Authoritative 60-scenario Orchestration Benchmark (`evals/corpora/orchestration_corpus_60.json`, evaluated in `logs/orchestrator_benchmark_results.json`): Architecture A (Baseline ToolLoopAgent, N=60) achieved full completion of only **31.67%**, with a **53.33% premature termination rate** and a **21.67% hallucinated success rate**. (Earlier initial 25-scenario prototype completed 17/25 = 68% before expanded adversary testing).
- **Resolution Plan**: Checkpoint C8 Persisted Quest Engine implemented (`lib/jarvis-core/quest/`) persisting step progress to SQLite across crashes and transitioning to `AWAITING_VERIFICATION`. Terminal Completion Verifier (ADR-005, Checkpoint C12) will govern the final completion decision.

---

### ISSUE-006: Latency Tail Outliers on Cold / Overloaded Model Providers
- **Severity**: MEDIUM
- **Component**: `lib/providers.ts`, `lib/agent.ts`
- **Status**: CONFIRMED & REPRODUCED
- **Description**: While median latency on fast local/cloud endpoints is 1.1s (text) and 3.2s (tool-assisted), multi-turn scenarios under provider failovers occasionally balloon to 30–79 seconds. This is caused by sequential timeouts across fallback providers without a global per-turn deadline.
- **Evidence**: Failure isolation audit Section 2 (`run_adversarial_scenarios.mjs`).
- **Resolution Plan**: Implement Provider-Role Router with strict per-role timeout budgets and an enforced global request deadline (15s voice, 30s text) in Checkpoint C14.
