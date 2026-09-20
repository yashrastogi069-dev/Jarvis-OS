# JARVIS CORE V2 — COMPREHENSIVE MARKDOWN & ARCHITECTURAL CHANGE DIRECTORY

**Document Version**: 1.0.0  
**Generated Date**: 2026-09-21  
**Branch**: `jarvis-core-v2`  
**Repository**: `https://github.com/yashrastogi069-dev/Jarvis-OS.git`  
**Latest Integration Commit**: `b8064f1` (`fix(core-v2): reconcile operation identity and quest lifecycle`)  

---

## 1. Overview & Purpose

This document provides a single, structured, easily understandable reference catalog of **all markdown (`.md`) files** across the Jarvis repository that have been created, modified, or updated during the **Jarvis Core V2 Foundation Engineering (Checkpoints C0–C8)** and the **Pre-C9 Foundation Reconciliation Gate**.

If you want to know **what file was changed**, **where to find it**, **why it was changed**, and **what exact content was added**, this directory is your complete map.

---

## 2. Quick Navigation Table: All Markdown Files

| # | File Name | Absolute Path / Location | Action | Primary Purpose / Summary of Changes |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **`ACTIVE_PLAN.md`** | [`tasks/ACTIVE_PLAN.md`](file:///C:/Users/win%2010/Desktop/Jarvis/tasks/ACTIVE_PLAN.md) | **MODIFIED** | Updated C0–C8 status to COMPLETE; added Pre-C9 Reconciliation Gate as COMPLETE; set C9 to READY / QUEUED. |
| 2 | **`DECISIONS.md`** | [`tasks/DECISIONS.md`](file:///C:/Users/win%2010/Desktop/Jarvis/tasks/DECISIONS.md) | **MODIFIED** | Updated ADR-002 (`AWAITING_VERIFICATION`), ADR-003 (operation identity & crash window), ADR-004 (Strategy E accepted). |
| 3 | **`KNOWN_ISSUES.md`** | [`tasks/KNOWN_ISSUES.md`](file:///C:/Users/win%2010/Desktop/Jarvis/tasks/KNOWN_ISSUES.md) | **MODIFIED** | Updated ISSUE-001 (resolved V2), ISSUE-002 (D-014), ISSUE-003 (resolved V2), ISSUE-004 (resolved V2), ISSUE-005 (mitigated). |
| 4 | **`DEFERRED.md`** | [`tasks/DEFERRED.md`](file:///C:/Users/win%2010/Desktop/Jarvis/tasks/DEFERRED.md) | **MODIFIED** | Added **`D-015`** (State-dependent external mutation precondition revalidation via ETags/mtime deferred to C19). |
| 5 | **`README.md` (Evals)** | [`evals/README.md`](file:///C:/Users/win%2010/Desktop/Jarvis/evals/README.md) | **MODIFIED** | Corrected typographical count in Section 2.2 from 114 to 124 single-tool prompts (matching 227 total). |
| 6 | **`JARVIS_BUILD_STATE.md`**| [`JARVIS_BUILD_STATE.md`](file:///C:/Users/win%2010/Desktop/Jarvis/JARVIS_BUILD_STATE.md) | **MODIFIED** | Updated cross-session resume contract, Pre-C9 gate complete, test count to 175/175, C9 ready/queued. |
| 7 | **`HANDOFF.md`** | [`HANDOFF.md`](file:///C:/Users/win%2010/Desktop/Jarvis/HANDOFF.md) | **MODIFIED** | Updated handoff status as of 2026-09-21; added prominent **`NEXT AGENT START HERE`** section. |
| 8 | **`IMPLEMENTATION_REPORT`**| [`JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md`](file:///C:/Users/win%2010/Desktop/Jarvis/JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md) | **MODIFIED** | Updated header metadata from Milestone 0 / C0 to Milestone 1 / Pre-C9 Gate Complete. |
| 9 | **`MEGA_GOAL_LOG.md`** | [`JARVIS_CORE_V2_MEGA_GOAL_C4_C8_LOG.md`](file:///C:/Users/win%2010/Desktop/Jarvis/JARVIS_CORE_V2_MEGA_GOAL_C4_C8_LOG.md) | **MODIFIED** | Marked header as `FINAL / HISTORICAL EXECUTION LOG — NOT ACTIVE PLAN`; logged C4–C8 completion. |
| 10 | **`CHANGELOG_AND_MD_GUIDE`**| [`JARVIS_CORE_V2_MD_CHANGES_AND_SUMMARY.md`](file:///C:/Users/win%2010/Desktop/Jarvis/JARVIS_CORE_V2_MD_CHANGES_AND_SUMMARY.md) | **CREATED** | *This file.* Comprehensive directory and explanation of all markdown documentation and code changes. |

---

## 3. Deep-Dive: File-by-File Breakdown of Changes

### 3.1 `tasks/ACTIVE_PLAN.md`
- **Location**: `C:\Users\win 10\Desktop\Jarvis\tasks\ACTIVE_PLAN.md`
- **Role**: The master authoritative roadmap governing all checkpoints from C0 to C23.
- **What Was Changed**:
  1. **Milestone Header**: Updated from `PRE-C9 FOUNDATION RECONCILIATION = ACTIVE` to `PRE-C9 FOUNDATION RECONCILIATION = COMPLETE`.
  2. **Next Checkpoint**: Marked `C9: Structured DAG Planner` as `READY / QUEUED` (previously marked `BLOCKED PENDING PRE-C9 GATE`).
  3. **Reconciliation Entry**: Added explicit section under Phase 2 recording the completion of the Pre-C9 Foundation Reconciliation Gate (contract hardening across C5/C6/C7/C8, test suite expanded to 175 tests).
  4. **C8 Unit Test Verification**: Updated C8 test count from 13 to 15 unit tests.

---

### 3.2 `tasks/DECISIONS.md`
- **Location**: `C:\Users\win 10\Desktop\Jarvis\tasks\DECISIONS.md`
- **Role**: Architectural Decision Records (ADRs) capturing key engineering trade-offs.
- **What Was Changed**:
  1. **ADR-002 (Persisted Quest Engine & Completion Boundary)**:
     - Updated schema references from `subgoals` to canonical `quest_steps`.
     - Recorded that when all steps succeed, the quest transitions to `AWAITING_VERIFICATION` (not `COMPLETED`), preserving the architectural ownership boundary of Checkpoint C12 (Completion Verifier).
  2. **ADR-003 (Operation Ledger: Logical Identity & Crash Window Semantics)**:
     - Clarified that logical operation identity (`operationId`) is **runtime-owned** (derived from `TurnId + slot` or `QuestId + PlanStepId`), not from content hashing.
     - Documented the role of `inputHash` as an integrity mismatch guard (`CONFLICT` on parameter tampering).
     - Defined local mutation crash window recovery: any in-flight mutation in `RUNNING` state transitions to `UNKNOWN_COMMIT` on boot (never `FAILED_RETRYABLE`), preventing duplicated database rows on retry.
  3. **ADR-004 (Capability Routing Strategy E)**:
     - Upgraded status from `PROVISIONAL` to `ACCEPTED FOR CORE V2`.
     - Validated by C7 shadow evaluation exceeding 99.5% required recall (achieved 100.0% recall on 227 prompts).

---

### 3.3 `tasks/KNOWN_ISSUES.md`
- **Location**: `C:\Users\win 10\Desktop\Jarvis\tasks\KNOWN_ISSUES.md`
- **Role**: Registry of confirmed bugs, exceptions, and security/safety vulnerabilities.
- **What Was Changed**:
  1. **ISSUE-001 (`deleteTask` unhandled crash & missing confirmation)**:
     - Marked **RESOLVED IN V2**. C3 Safe Boundary prevents exceptions; C4 Action Policy enforces cryptographically bound confirmation tokens and clarification on missing IDs. (Legacy V1 remains unsafe until cutover).
  2. **ISSUE-002 (Unregistered skills capabilities)**:
     - Corrected deferred tracking reference for `discoverSkillCandidates` from D-005 to `D-014`.
  3. **ISSUE-003 (Connector registry `promptHint` omits 13 tools)**:
     - Marked **RESOLVED IN CORE V2**. V2 uses dynamic capability introspection from C2 registry and C7 router.
  4. **ISSUE-004 (Lack of mutation idempotency on `createTask` / `saveMemory`)**:
     - Marked **RESOLVED IN CORE V2**. Resolved by C5 Operation Ledger with runtime-owned logical IDs, input hash conflict checks, and crash recovery semantics.
  5. **ISSUE-005 (Premature multi-goal completion)**:
     - Marked **MITIGATED IN CORE V2 FOUNDATION**. C8 Persisted Quest Engine tracks step progress in SQLite and pauses in `AWAITING_VERIFICATION`. Final verification pending C12.

---

### 3.4 `tasks/DEFERRED.md`
- **Location**: `C:\Users\win 10\Desktop\Jarvis\tasks\DEFERRED.md`
- **Role**: Register of valuable but deliberately postponed engineering items to prevent scope creep.
- **What Was Changed**:
  - Added new item **`D-015 — State-Dependent External Mutation Precondition Revalidation`**:
    - *Description*: Revalidating preconditions (ETags, file content hashes, mtime leases) immediately before executing destructive file overwrites or external modifications, preventing TOCTOU races between confirmation preview creation and user execution.
    - *Dependency*: Checkpoint C19 (External Mutation Connectors Migration).
    - *Status*: DEFERRED.

---

### 3.5 `evals/README.md`
- **Location**: `C:\Users\win 10\Desktop\Jarvis\evals\README.md`
- **Role**: Documentation for benchmark harnesses and evaluation test corpora.
- **What Was Changed**:
  - Section 2.2 (`corpora/routing_corpus_227.json`): Corrected typographical error stating `114 Single-Tool Prompts` to `124 Single-Tool Prompts`.
  - Reconciled exact arithmetic: 124 single-tool + 20 multi-tool + 40 adversarial + 12 ambiguous + 15 phrasing variants + 16 semantic confusion pairs = **227 total prompts**.

---

### 3.6 `JARVIS_BUILD_STATE.md`
- **Location**: `C:\Users\win 10\Desktop\Jarvis\JARVIS_BUILD_STATE.md`
- **Role**: The permanent cross-session resume contract read by any new agent starting work.
- **What Was Changed**:
  1. Updated Milestone status to `PRE-C9 FOUNDATION RECONCILIATION COMPLETE & VERIFIED`.
  2. Updated Next Checkpoint to `C9 — Structured DAG Planner (READY / QUEUED)`.
  3. Updated automated test count to `9 test files, 175 tests, 100% green pass`.
  4. Summarized the reconciled C1–C8 baseline architecture (foundation types, canonical registry, safe boundary, action policy, operation ledger, intent modes, capability router, and quest engine).

---

### 3.7 `HANDOFF.md`
- **Location**: `C:\Users\win 10\Desktop\Jarvis\HANDOFF.md`
- **Role**: Session transition document providing context and instructions for subsequent developers/agents.
- **What Was Changed**:
  1. Updated status date to **2026-09-21**.
  2. Updated test suite health metrics to **175/175 tests passed (100% green)**.
  3. Added prominent **`## NEXT AGENT START HERE`** callout box with explicit instructions:
     - DO NOT start C9 automatically; wait for user instruction.
     - Verify test baseline (175/175 green) and git branch (`jarvis-core-v2`).
     - Review `types.ts`, `quest/types.ts`, and `ledger/types.ts` before generating DAG planner schemas.
     - Respect `AWAITING_VERIFICATION` boundary owned by C12.

---

### 3.8 `JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md`
- **Location**: `C:\Users\win 10\Desktop\Jarvis\JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md`
- **Role**: Comprehensive technical report documenting the implementation details of Core V2.
- **What Was Changed**:
  - Header metadata updated from Milestone 0 / C0 to **Milestone 1 / Pre-C9 Foundation Reconciliation Gate Complete** as of **2026-09-21**.

---

### 3.9 `JARVIS_CORE_V2_MEGA_GOAL_C4_C8_LOG.md`
- **Location**: `C:\Users\win 10\Desktop\Jarvis\JARVIS_CORE_V2_MEGA_GOAL_C4_C8_LOG.md`
- **Role**: Detailed historical log of the long-running C4–C8 autonomous engineering goal.
- **What Was Changed**:
  - Added warning banner near the top: `FINAL / HISTORICAL EXECUTION LOG — NOT ACTIVE PLAN`.
  - Updated status to `COMPLETE (Pre-C9 Foundation Reconciliation Finalized)` on `2026-09-21`.

---

## 4. Summary of Code & Test Files Hardened in Pre-C9 Gate

For completeness, below are the TypeScript source and test files reconciled alongside the documentation above:

### Source Code (`lib/jarvis-core/`)
1. **`lib/jarvis-core/types.ts`**:
   - Added `AWAITING_VERIFICATION` to `QuestStatus`.
   - Added backward-compatible aliases `SUCCEEDED` and `SKIPPED` to `StepStatus`.
2. **`lib/jarvis-core/intent/`** (`types.ts`, `classifier.ts`, `analyzer.ts`, `ambiguity.ts`):
   - Aligned `IntentCategory` to equal canonical `ExecutionMode` (`CHAT`, `READ`, `ACTION`, `QUEST`).
   - Added `mode` and `intentKind` fields to `IntentAnalysisResult`.
   - Added deletion synonyms (`erase`, `drop`, `remove it from my list`, `delete that entry`, `forget about it`) to prevent unconfirmed destructive actions.
3. **`lib/jarvis-core/ledger/`** (`types.ts`, `canonical.ts`, `ledger.ts`):
   - Added runtime-owned `operationId` derivation (`deriveActionOperationId`, `deriveQuestStepOperationId`).
   - Added `inputHash` argument mismatch guard (`CONFLICT` if parameters change for the same `operationId`).
   - Hardened `recoverCrashedOperations`: In-flight mutations in `RUNNING` state transition to `UNKNOWN_COMMIT` on boot (only `READ_ONLY` transitions to `FAILED_RETRYABLE`).
4. **`lib/jarvis-core/quest/`** (`types.ts`, `engine.ts`):
   - Reconciled `QuestId` and `StepId` with canonical `PlanStepId`.
   - Updated `completeStep`: Transitions quest to `AWAITING_VERIFICATION` upon all steps succeeding (preserving C12 verifier boundary).
   - Added `verifyAndCompleteQuest` gateway for C12 completion decision.
   - Updated `recoverCrashedQuests`: In-flight steps reconcile with ledger (`UNKNOWN_COMMIT` -> step becomes `UNKNOWN_COMMIT`, never re-queued as executable `PENDING`).

### Tests (`tests/jarvis-core/`)
1. **`tests/jarvis-core/quest-engine.test.ts`** (15 tests, 100% green):
   - Tested `AWAITING_VERIFICATION` transition.
   - Tested `verifyAndCompleteQuest` terminal gateway.
   - Tested crash recovery with ledger `UNKNOWN_COMMIT` and `SUCCEEDED` states.
2. **`tests/jarvis-core/operation-ledger.test.ts`** (22 tests, 100% green):
   - Tested logical `operationId` vs input mismatch `CONFLICT`.
   - Tested consecutive distinct turns with identical payloads executing safely.
   - Tested file-backed SQLite fault injection simulating mid-write process crashes for `tasks.create` and `memory.save` with 15s disk timeout.
3. **`tests/jarvis-core/intent-analysis.test.ts`** (16 tests, 100% green):
   - Tested canonical `ExecutionMode` emission.
   - Tested held-out destructive ambiguity synonym suite (100% interception rate, 0 unconfirmed executions).
4. **`tests/jarvis-core/integration-c4-c8.test.ts`** (9 tests, 100% green):
   - Reconciled Scenario 7 with `AWAITING_VERIFICATION` + `verifyAndCompleteQuest`.
   - Reconciled Recovery Scenario 1 with `UNKNOWN_COMMIT` crash recovery semantics.

---

## 5. System Health Status

- **Typecheck**: `pnpm typecheck` (`tsc --noEmit`) -> **0 errors (100% clean)**.
- **Unit & Integration Tests**: `pnpm vitest run tests/jarvis-core/` -> **9 test files, 175 tests passed (100% green)**.
- **Production Build**: `pnpm build` -> **Turbopack build clean; 28 dynamic API routes compiled**.
- **Legacy V1 Protection**: **100% untouched** (zero modifications outside `lib/jarvis-core/`).
- **Next Directive**: **STOP. DO NOT BEGIN C9.** Await explicit user authorization.
