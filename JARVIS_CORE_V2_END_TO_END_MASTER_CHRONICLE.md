# JARVIS CORE V2 — COMPLETE END-TO-END MASTER CHRONICLE
## Full Chronological Record: Pre-Fix Investigation, Audits, Contract Repairs, Architecture Decision Records, Checkpoints C0 through C16, File Mutations, Tests, Failures, and Resolutions

**Repository**: `https://github.com/yashrastogi069-dev/Jarvis-OS.git`  
**Branch**: `jarvis-core-v2`  
**Current HEAD Commit**: `6449df0`  
**Base Audit Commit**: `cf8dda2`  
**Environment**: Next.js 16.2.6 (Turbopack), React 19.2.4, Node.js v24.15.0, SQLite3 (better-sqlite3 + sqlite-vec), TypeScript 5.x, pnpm 9.x  
**Operating System**: Windows 10 Pro  
**Document Generation Date**: September 21, 2026  
**Status**: **CHECKPOINTS C0 THROUGH C16 FULLY IMPLEMENTED, TESTED (311/311 TESTS GREEN), TYPECHECKED (0 ERRORS), COMPILED TO PRODUCTION, AND COMMITTED. STOPS STRICTLY AT C16 GATE.**

---

## TABLE OF CONTENTS

1. [Executive Summary & High-Level Invariants](#1-executive-summary--high-level-invariants)
2. [Stage 0: Pre-Fix Failure Isolation & Empirical Audits](#2-stage-0-pre-fix-failure-isolation--empirical-audits)
   - 2.1 The Core Paradox: Claimed 1.1s vs. Real-World 30–123s Freezes
   - 2.2 Watchdog Analysis & Stacked Timeout Cascades
   - 2.3 Empirical 18-Run Reproduction Findings
   - 2.4 Tool Contract & Safety Audit (47 Registered Tools + 4 Hidden Capabilities)
   - 2.5 Orchestration Benchmark Matrix (Architectures A, B, and C across 60 Scenarios)
   - 2.6 Architecture Decision Records (ADRs 001 through 007)
3. [Stage 1: Phase 1 Foundation Subsystem (Checkpoints C0 → C8)](#3-stage-1-phase-1-foundation-subsystem-checkpoints-c0--c8)
   - 3.1 Checkpoint C0: Baseline Reconciliation & Governance
   - 3.2 Checkpoint C1: Foundation Domain Types & Runtime Contracts
   - 3.3 Checkpoint C2: Canonical Capability Registry & Domain Classification
   - 3.4 Checkpoint C3: Structured Result Envelope & Safe Execution Boundary
   - 3.5 Checkpoint C4: Central Action Safety Policy & Preview Generation
   - 3.6 Checkpoint C5: Persistent Operation Ledger & Idempotency Engine
   - 3.7 Checkpoint C6: Intent Analysis & Ambiguity System
   - 3.8 Checkpoint C7: Capability Router & Strategy E Shadow Evaluation
   - 3.9 Checkpoint C8: Persisted Quest Engine & Crash Recovery Harness
4. [Stage 2: Foundation Reconciliation Gate & Direct Action Identity](#4-stage-2-foundation-reconciliation-gate--direct-action-identity)
   - 4.1 Implementation Report Truth Reconciliation
   - 4.2 Direct ACTION Retry Identity Proof (Test 12)
   - 4.3 Canonical Status Vocabulary Unification
5. [Stage 3: Phase 2 Multi-Step Orchestration (Checkpoints C9 → C13)](#5-stage-3-phase-2-multi-step-orchestration-checkpoints-c9--c13)
   - 5.1 Checkpoint C9: Structured DAG Planner
   - 5.2 Checkpoint C10: Deterministic Plan Validator
   - 5.3 Checkpoint C11: Deterministic DAG Executor
   - 5.4 Checkpoint C12: Terminal Completion Verifier
   - 5.5 Checkpoint C13: Bounded Quest Replanner
   - 5.6 Cross-Checkpoint Integration Gate (C9–C13): 20 Canonical Scenarios
6. [Stage 4: Pre-Phase-4 Runtime Contract Repair (Gates A through J)](#6-stage-4-pre-phase-4-runtime-contract-repair-gates-a-through-j)
   - 6.1 Gate A: Cryptographic Confirmation Security (Zero Model Authority)
   - 6.2 Gate B: Canonical Input Normalization Equivalence
   - 6.3 Gate C: UNKNOWN_COMMIT Persistence & Safe Downstream Blocking
   - 6.4 Gate D: Durable Quest Plan & Step Persistence in SQLite
   - 6.5 Gate E: Direct ACTION Runtime & Regex Argument Resolver
   - 6.6 Gate F: Intent Fast-Path Target Correctness
   - 6.7 Gate G: Preview Schema Alignment
   - 6.8 Gates H, I, J: Replanner Loop Bounds, State Purity, and Abortability Contracts
7. [Stage 5: Phase 3 Provider Routing, Finalization & Runtime Composition (C14 → C16)](#7-stage-5-phase-3-provider-routing-finalization--runtime-composition-c14--c16)
   - 7.1 Checkpoint C14: Provider-Role Router & Global Deadline Model
   - 7.2 Checkpoint C15: Grounded Finalizer & Response Generator
   - 7.3 Checkpoint C16: Core Runtime Composition, Structured Progress & SSE Streaming
8. [Stage 6: Master Inventory of All File Changes, Additions & Removals](#8-stage-6-master-inventory-of-all-file-changes-additions--removals)
   - 8.1 Files Created in Core V2
   - 8.2 Files Modified
   - 8.3 Files Removed / Deprecated
   - 8.4 Legacy V1 Isolation Verification
9. [Stage 7: Complete Test Suite Inventory & Results (19 Files, 311 Tests)](#9-stage-7-complete-test-suite-inventory--results-19-files-311-tests)
   - 9.1 Test Suite Breakdown Table
   - 9.2 TypeScript & Production Build Verification
10. [Stage 8: Comprehensive Catalog of Bugs, Edge Cases & Resolutions](#10-stage-8-comprehensive-catalog-of-bugs-edge-cases--resolutions)
11. [Stage 9: Hard-Stop Compliance & Governance Checklist](#11-stage-9-hard-stop-compliance--governance-checklist)
12. [Stage 10: Phase 5 Capability Migration Roadmap (C17+)](#12-stage-10-phase-5-capability-migration-roadmap-c17)

---

## 1. EXECUTIVE SUMMARY & HIGH-LEVEL INVARIANTS

The Jarvis Core V2 migration is an end-to-end architectural re-engineering of the Jarvis Agentic Operating System. The program was initiated after empirical audits revealed that the existing monolithic architecture (based on the Vercel AI SDK `ToolLoopAgent` and unstructured runtime tool injection) suffered from extreme latency degradation (30s to 123s freezes), a 70% real-world usability failure rate at $\le 10$ seconds, unhandled tool exceptions in 55% of capabilities, premature multi-goal abandonment (53.3%), and LLM hallucination of unexecuted actions (21.7%).

Jarvis Core V2 replaces this monolithic pattern with a deterministic, local-first runtime decoupled into distinct stages:
1. **Deterministic Fast-Path Intent Routing**: Separates pure chat, read-only lookups, and single-step direct mutations from complex multi-step graph quests.
2. **Strategy E Capability Routing**: Dynamically prunes tool schemas from 47 down to $\le 12$, cutting prompt token loads by 86% while maintaining 100% capability recall.
3. **Structured DAG Planning & Deterministic Validation**: Deconstructs multi-step user goals into acyclic execution graphs with RFC 6901 JSON pointer dataflow, validated against strict structural, schema, and security invariants.
4. **Wave-Based Deterministic Execution**: Dispatches independent read operations concurrently (up to concurrency 4) while strictly serializing mutating and destructive operations (concurrency 1) to eliminate race conditions.
5. **Runtime-Owned Persistent Operation Ledger**: Uses SHA-256 operation hashing and two-phase SQLite transaction claiming to enforce exactly-once execution and crash recovery caching.
6. **Zero Model Authority**: Cryptographic tokens generated by deterministic code control destructive execution; the LLM has zero authority to approve mutations or bypass security barriers.
7. **Single Global Turn Deadline**: Replaces cascading per-provider watchdog timers with a unified dual-threshold deadline model (`hardDeadline` + `softDeadline` wrap-up buffer).
8. **Grounded Finalization**: Anti-hallucination synthesizer ensures that actions not confirmed in the persistent ledger are never claimed as completed.
9. **W3C Server-Sent Events (SSE)**: Delivers monotonic sequence IDs (`1, 2, 3...`) and replay buffers for robust real-time client streaming.

```
                                    USER REQUEST
                                         │
                                         ▼
                   ┌───────────────────────────────────────────┐
                   │ Deterministic Fast-Path Classifier (C5/F) │
                   │  - Evaluates regex patterns & resources   │
                   │  - Identifies: CHAT, READ, ACTION, QUEST  │
                   └─────────────────────┬─────────────────────┘
                                         │
             ┌───────────────────────────┴───────────────────────────┐
             │ (Single Action)                                       │ (Multi-Step Goal)
             ▼                                                       ▼
┌─────────────────────────┐                             ┌─────────────────────────┐
│ Direct Action Runtime   │                             │ Structured DAG Planner  │
│  - Argument Resolver    │                             │  - Routed Capabilities  │
│  - Policy Verification  │                             │  - Kahn's Acyclicity    │
│  - Ledger Claim (C4)    │                             │  - RFC 6901 $ref args   │
│  - Safe Boundary (C3)   │                             └───────────┬─────────────┘
└────────────┬────────────┘                                         │
             │                                                      ▼
             │                                          ┌─────────────────────────┐
             │                                          │ Deterministic Validator │
             │                                          │  - Zod Schema Check     │
             │                                          │  - Prototype Defense    │
             │                                          │  - Zero Model Authority │
             │                                          └───────────┬─────────────┘
             │                                                      │
             │                                                      ▼
             │                                          ┌─────────────────────────┐
             │                                          │ Deterministic Executor  │
             │                                          │  - Wave-based dispatch  │
             │                                          │  - Concurrent reads (4) │
             │                                          │  - Serial mutations (1) │
             │                                          │  - Two-Phase pause      │
             │                                          │  - Ledger Deduplication │
             │                                          └───────────┬─────────────┘
             │                                                      │
             │                                                      ▼
             │                                          ┌─────────────────────────┐
             │                                          │ Terminal Verifier (C12) │
             │                                          │  - Ledger verification  │
             │                                          │  - Anti-hallucination   │
             │                                          │  - QuestEngine sync     │
             │                                          └───────────┬─────────────┘
             │                                                      │
             └───────────────────────────┬──────────────────────────┘
                                         │
                                         ▼
                   ┌───────────────────────────────────────────┐
                   │        Grounded Finalizer (C15)           │
                   │  - Secret Redaction Engine                │
                   │  - Deterministic Fallback Synthesizer     │
                   │  - Provider Role Router (C14)             │
                   └─────────────────────┬─────────────────────┘
                                         │
                                         ▼
                   ┌───────────────────────────────────────────┐
                   │      W3C SSE Streaming Engine (C16)       │
                   │  - Monotonic Sequence IDs (1, 2, 3...)    │
                   │  - Event Replay Buffer & Reconnect Window │
                   └───────────────────────────────────────────┘
```

---

## 2. STAGE 0: PRE-FIX FAILURE ISOLATION & EMPIRICAL AUDITS

Before any production or Core V2 code was written, a strict pre-fix empirical investigation was conducted under audit commit `cf8dda2`.

### 2.1 The Core Paradox: Claimed 1.1s vs. Real-World 30–123s Freezes
Prior documentation asserted that Jarvis operated with a text p50 latency of ~1.1s and a tool p50 latency of ~3.2s. However, live testing repeatedly triggered extreme user-perceived delays between 30 and 123 seconds.

Empirical profiling isolated four converging causes:
1. **Schema Injection Bloat**: Every incoming request unconditionally serialized 47 JSON tool schemas totaling 31,282 characters (~8,232 tokens). Combined with conversation history, initial prompts averaged ~9,300 tokens before execution began.
2. **Groq Rate-Limit Throttling**: Groq free-tier models enforce a 6,000 Tokens-Per-Minute (TPM) ceiling. Submitting a 9,300-token prompt immediately exceeded the bucket, triggering cloud gateway queuing, backoff, or silent stream stalls.
3. **Stacked 45-Second Watchdog Timers**: `lib/agent.ts#L469` contained an inactivity watchdog:
   ```typescript
   const STREAM_INACTIVITY_TIMEOUT_MS = 45_000
   ```
   When Gemini hit its daily free quota limit, it stalled silently. The system waited 45,000ms for the watchdog to fire before failing over to Groq. Groq then armed a *second* 45-second watchdog. If Groq choked on the 9,300-token prompt, an additional 45,000ms elapsed.
4. **Next.js Max Duration Boundary**: Next.js route configuration in `app/api/chat/route.ts` capped execution at 120 seconds (`export const maxDuration = 120`). Two stacked 45s watchdogs plus processing latency pushed turns to 123s, resulting in hard 504 gateway timeouts.

### 2.2 Watchdog Analysis & Stacked Timeout Cascades
The observed latency clusters (~10s, ~45s, ~90s, ~123s) were direct mathematical signatures of provider failover cycles:
- **Cluster 1 (~10s)**: Gemini or Groq succeeds on the primary call after ~9,300-token schema prefill.
- **Cluster 2 (~45s)**: Gemini stalls $\to$ 45s watchdog fires $\to$ failover to Groq $\to$ Groq succeeds.
- **Cluster 3 (~90s)**: Gemini stalls (45s) $\to$ Groq stalls (45s) $\to$ failover to OpenRouter $\to$ succeeds.
- **Cluster 4 (~123s)**: Gemini stalls (45s) $\to$ Groq stalls (45s) $\to$ OpenRouter stalls or exceeds Next.js 120s ceiling $\to$ Hard HTTP route termination.

### 2.3 Empirical 18-Run Reproduction Findings
Six critical user scenarios were reproduced in triplicate (18 runs) against the live server:

| Scenario ID | User Prompt | Expected Tools | Actual Behavior | Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **D1 (1–3)** | "Create a task 'Buy groceries' and list all my tasks" | `createTask`, `listTasks` | Executed `createTask` in step 1; stalled on continuation; never invoked `listTasks`; hit 45s/120s timeout. | **100% FAIL (0/3)** |
| **D2 (1–3)** | "Search the web for Quantum Computing news and save a summary to memory" | `webSearch`, `saveMemory` | Executed `webSearch` (~3s); model emitted conversational text; dropped `saveMemory` completely. | **100% FAIL (0/3)** |
| **A3 (1–3)** | "Explain what this project does" | `[]` (Pure Chat) | Schema bloat caused Gemini to hallucinate that local notes must be searched via `searchNotes`. | **66.7% FAIL (2/3)** |
| **E2 (1–3)** | "Read my note on Architecture in Obsidian" | `readNote` | In 2/3 runs, called `searchNotes` instead of `readNote`. Obsidian was unconfigured; thrown Error was masked to `"An error occurred."` | **66.7% FAIL (2/3)** |
| **C2 (1–3)** | "Create a task 'Call plumber tomorrow'" | `createTask` | Created task, but suffered 47s to 85s latency due to Gemini 45s stall. | **33.3% FAIL (1/3)** |
| **C6 (1–3)** | "List my skills" | `listSkills` | 1 stream crash, 1 Groq stall (72s), 1 success (44s). | **66.7% FAIL (2/3)** |

**Usability Scorecard Across 18 Runs**:
- Complete-turn latency $\le 5$s: **5.0%** (1 / 20)
- Complete-turn latency $\le 10$s: **30.0%** (6 / 20)
- **Failure rate under realistic 10s ceiling: 70.0%**.

### 2.4 Tool Contract & Safety Audit (47 Registered Tools + 4 Hidden Capabilities)
An automated contract inspection across all 47 registered tools uncovered widespread reliability and safety vulnerabilities:
1. **26 of 47 Tools (55.3%) Threw Unhandled Exceptions**:
   - `completeTask(999999)` threw `Error("Task not found")`.
   - `saveAsSkill` on duplicate name threw SQLite `SqliteError: UNIQUE constraint failed`.
   - `getGithubNotifications` threw `Error("GITHUB_TOKEN is not set")`.
   - `searchNotes` threw network error when Obsidian Local REST API was offline.
   - When thrown into Vercel AI SDK, these exceptions were swallowed and masked to the generic client string `"An error occurred."`.
2. **Four Implemented Capabilities Were Completely Unregistered**:
   - `lib/skills.ts` contained full production logic for:
     - `deploySkillToGithub` (GitHub Contents API PUT)
     - `deleteSkill` (SQLite cascade deletion)
     - `proposeRefinement` (Loop engine self-refinement)
     - `discoverSkillCandidates` (Continuous background discovery)
   - None were exposed in `allTools`, making them completely inaccessible to conversational users.
3. **Thirteen Tools Omitted from System Prompt Hints**:
   - `lib/connectors/registry.ts` generated hints that omitted `createCalendarEvent`, `sendGmail`, `createAppleCalendarEvent`, and all exact Obsidian identifiers (`readNote`, `appendNote`, `createNote`, `searchNotes`).
4. **Destructive Safety Inconsistencies**:
   - `deleteMemory` enforced a 2-phase confirmation preview.
   - `deleteTask` executed permanent, irreversible deletion immediately without confirmation.
   - `createNote` silently overwrote existing Obsidian vault files.
   - `sendTelegram` sent external messages immediately without confirmation.
5. **Zero Idempotency Protection**:
   - `createTask` and `saveMemory` performed raw `INSERT` queries with no client tokens or deduplication hashes. Retrying identical turns created duplicate tasks and duplicate vector embeddings.

### 2.5 Orchestration Benchmark Matrix (Architectures A, B, and C across 60 Scenarios)
A controlled benchmark of 60 multi-step scenarios (`evals/corpora/orchestration_corpus_60.json`) evaluated three competing architectures:

| Evaluation Dimension | Architecture A (Baseline ToolLoopAgent) | Architecture B (Loop + Completion Verifier) | Architecture C (Core V2 DAG Planner-Executor) |
| :--- | :---: | :---: | :---: |
| **Full Task Completion Rate** | 31.67% (19/60) | **96.67%** (58/60) | **88.33%** (53/60)* |
| **Premature Termination Rate** | 53.33% | 3.33% | **0.00%** |
| **Hallucinated Success Rate** | 21.67% | **0.00%** | **0.00%** |
| **Average Input Tokens / Turn**| 23,119 | 33,694 | **3,187 (-86.2%)** |
| **Turn Latency p50** | 700 ms | 1,390 ms | **660 ms** |
| **Estimated Cost / 1k Turns** | $3.639 | $5.371 | **$0.816 (-77.6%)** |
| **Step Limit Sensitivity** | `maxSteps` 6 $\to$ 20 produced 0% gain (completion remained 7.5%–12.5% on 3+ steps) | N/A | Deterministic bounds |

*\*Note on Architecture C*: On executable scenarios with valid credentials, Architecture C achieved **100.0% completion**. The 7 partial completions occurred because unrecoverable external faults (e.g. invalid GitHub tokens) were honestly reported as `BLOCKED_WITH_REASON` instead of hallucinating completion.

### 2.6 Architecture Decision Records (ADRs 001 through 007)
Seven fundamental Architecture Decision Records were established:
- **ADR-001 (Parallel Evolution Architecture)**: Build Core V2 completely isolated in `lib/jarvis-core/` beside V1. Never modify or break legacy V1 until full verification.
- **ADR-002 (Persisted Quest Engine)**: Persist all multi-step goals to SQLite `quests` and `quest_steps` tables. State machine transitions to `AWAITING_VERIFICATION` upon completion, preserving C12 verifier boundary.
- **ADR-003 (Runtime-Owned Persistent Operation Ledger)**: Derive deterministic `operationId` (`TurnId + slot + CapabilityId` or `QuestId + PlanStepId + CapabilityId`). In-flight mutations crashing mid-execution transition to `UNKNOWN_COMMIT` (never `FAILED_RETRYABLE`), safely blocking retries.
- **ADR-004 (Strategy E Capability Routing)**: Hybrid keyword/domain classifier + semantic search pruning tool schemas to $\le 12$, with automatic fail-open fallback on low confidence.
- **ADR-005 (Deterministic DAG Planner-Executor)**: Decouple planning, validation, wave-based execution, and criteria verification into deterministic components.
- **ADR-006 (Canonical Capability Registry)**: Hierarchical namespaced IDs (`tasks.create`, `google.mail.message.send`), 12 finite domains, decoupled from AI SDK adapters.
- **ADR-007 (Structured Capability Result & Safe Boundary)**: Universal `executeCapabilitySafely` gateway returning `CapabilityResult<T>`, 14 finite error codes, secret redaction, and `UNKNOWN_COMMIT` classification.

---

## 3. STAGE 1: PHASE 1 FOUNDATION SUBSYSTEM (CHECKPOINTS C0 → C8)

Phase 1 established the foundational types, registries, safety rules, and persistence primitives for Jarvis Core V2.

### 3.1 Checkpoint C0: Baseline Reconciliation & Governance
- **Commit**: `79b53bb` (`docs(c0): complete Checkpoint C0 repository truth and baseline reconciliation`)
- **Deliverables**: Reconciled Next.js to 16.2.6, package manager to pnpm, initialized `tasks/ACTIVE_PLAN.md`, `tasks/DECISIONS.md`, and `tasks/KNOWN_ISSUES.md`. Established baseline test suite (6 files, 35 tests).

### 3.2 Checkpoint C1: Foundation Domain Types & Runtime Contracts
- **Commits**: `8b0ca8e`, `33c64ed`, `d617e41`
- **File Created**: `lib/jarvis-core/types.ts` (339 lines)
- **Key Invariants**:
  - Branded nominal string types: `TraceId`, `TurnId`, `QuestId`, `PlanId`, `PlanStepId`, `CapabilityId`, `OperationId`.
  - Discriminated execution modes: `CHAT`, `READ`, `ACTION`, `QUEST`.
  - Explicit ambiguity modeling via `ClassificationOutcome` (`resolved` vs `needsClarification`).
  - Zero framework imports (pure TypeScript, zero coupling to Next.js or Vercel AI SDK).
- **Test File**: `tests/jarvis-core/types.test.ts` (14 unit tests, 100% green).

### 3.3 Checkpoint C2: Canonical Capability Registry & Domain Classification
- **Commit**: `69c4346` (`feat(core-v2): add canonical capability registry`)
- **Files Created**:
  - `lib/jarvis-core/capabilities/types.ts`
  - `lib/jarvis-core/capabilities/definitions/local.ts` (18 capabilities)
  - `lib/jarvis-core/capabilities/definitions/research.ts` (2 capabilities)
  - `lib/jarvis-core/capabilities/definitions/connectors.ts` (27 capabilities)
  - `lib/jarvis-core/capabilities/definitions/unregistered.ts` (4 candidates formally classified: `deploySkillToGithub` as NOT_READY/D-011, `deleteSkill` as INTERNAL_ENGINE/D-012, `proposeRefinement` as INTERNAL_ENGINE/D-013, `discoverSkillCandidates` as BACKGROUND/D-014)
  - `lib/jarvis-core/capabilities/registry.ts` (`CapabilityRegistry` singleton)
  - `lib/jarvis-core/capabilities/diagnostics.ts`
- **Test File**: `tests/jarvis-core/capabilities.test.ts` (12 unit tests, 100% green).

### 3.4 Checkpoint C3: Structured Result Envelope & Safe Execution Boundary
- **Commit**: `9f150c1` (`feat(core-v2): add structured capability result boundary`)
- **Files Created**:
  - `lib/jarvis-core/capabilities/result.ts`: `CapabilityResult<T>` discriminated union (`success: true/false`).
  - `lib/jarvis-core/capabilities/json.ts`: `toJsonValue` deterministic normalizer with circular reference detection (WeakSet) and BigInt/Date conversion.
  - `lib/jarvis-core/capabilities/safe-boundary.ts`: `executeCapabilitySafely` gateway with 14-code taxonomy, secret redaction, and `UNKNOWN_COMMIT` classification.
- **Test File**: `tests/jarvis-core/result-boundary.test.ts` (39 unit tests, 100% green).

### 3.5 Checkpoint C4: Central Action Safety Policy & Preview Generation
- **Commit**: `1c46622` (`feat(core-v2): add central action safety policy`)
- **Files Created**:
  - `lib/jarvis-core/safety/types.ts`: `ActionClass` (`READ_ONLY`, `LOCAL_MUTATION`, `EXTERNAL_MUTATION`, `DESTRUCTIVE`), `PolicyDecision`, `ConfirmationToken`.
  - `lib/jarvis-core/safety/tokens.ts`: HMAC-SHA256 cryptographic token generator (`cf_<timestamp>_<hash>`) binding operation, arguments, and timestamp with 5-minute expiry.
  - `lib/jarvis-core/safety/preview.ts`: Deterministic preview generator producing human-readable diffs for destructive actions.
  - `lib/jarvis-core/safety/policy.ts`: `ActionPolicyManager` evaluating capabilities against safety tiers.
- **Test File**: `tests/jarvis-core/safety-policy.test.ts` (25 unit tests, 100% green).

### 3.6 Checkpoint C5: Persistent Operation Ledger & Idempotency Engine
- **Commit**: `c43dd13` (`feat(core-v2): add persistent operation ledger`)
- **Files Created**:
  - `lib/jarvis-core/ledger/schema.ts`: SQLite table `operations` with indexes on `operation_id`, `turn_id`, `quest_id`, and `dedupe_key`.
  - `lib/jarvis-core/ledger/types.ts`: `OperationRecord`, `OperationStatus`, `OperationClaimResult`.
  - `lib/jarvis-core/ledger/canonical.ts`: Deterministic SHA-256 operation hashing and dedupe key generation.
  - `lib/jarvis-core/ledger/ledger.ts`: `OperationLedger` managing atomic state transitions (`PENDING` $\to$ `RUNNING` $\to$ `SUCCEEDED` / `FAILED` / `UNKNOWN_COMMIT`).
- **Test File**: `tests/jarvis-core/operation-ledger.test.ts` (22 tests, 100% green).

### 3.7 Checkpoint C6: Intent Analysis & Ambiguity System
- **Commit**: `d47ddb5` (`feat(core-v2): add intent analysis and ambiguity system`)
- **Files Created**:
  - `lib/jarvis-core/intent/types.ts`: `IntentClassification`, `AmbiguityAssessment`, `ClarificationRequest`.
  - `lib/jarvis-core/intent/classifier.ts`: Deterministic fast-path regex classifier identifying explicit queries, calendar lookups, note searches, and task commands without LLM overhead.
  - `lib/jarvis-core/intent/ambiguity.ts`: Ambiguity detector calculating confidence scores and generating targeted clarification prompts when confidence $< 0.6$.
- **Test File**: `tests/jarvis-core/intent-analysis.test.ts` (16 unit tests, 100% green).

### 3.8 Checkpoint C7: Capability Router & Strategy E Shadow Evaluation
- **Commit**: `bddcb12` (`feat(core-v2): add capability router and shadow evaluation`)
- **Files Created**:
  - `lib/jarvis-core/routing/types.ts`: `RoutingDecision`, `RouterConfig`.
  - `lib/jarvis-core/routing/router.ts`: Strategy E hybrid router combining keyword heuristics with domain indexing, capped at $\le 12$ capabilities per turn with automatic fail-open fallback.
  - `lib/jarvis-core/routing/shadow.ts`: Shadow evaluator comparing Strategy E against full 47-tool baseline in real time.
- **Test File**: `tests/jarvis-core/capability-router.test.ts` (23 unit tests, 100% green). Verified 100% recall on 227-prompt evaluation corpus.

### 3.9 Checkpoint C8: Persisted Quest Engine & Crash Recovery Harness
- **Commits**: `3fe2cdc`, `859932b`
- **Files Created**:
  - `lib/jarvis-core/quest/schema.ts`: SQLite schema for `quests` and `quest_steps`.
  - `lib/jarvis-core/quest/types.ts`: `QuestRecord`, `QuestStepRecord`, `QuestRecoveryPlan`.
  - `lib/jarvis-core/quest/engine.ts`: `QuestEngine` providing atomic quest creation, step transition persistence, and reboot recovery reconciliation against `OperationLedger`.
- **Test Files**:
  - `tests/jarvis-core/quest-engine.test.ts` (15 unit tests, 100% green).
  - `tests/jarvis-core/integration-c4-c8.test.ts` (9 integration tests, 100% green).

---

## 4. STAGE 2: FOUNDATION RECONCILIATION GATE & DIRECT ACTION IDENTITY

Before launching Phase 2 (DAG planning and execution), a critical reconciliation pass was executed in commit `b8064f1` and documented in `30c6d9f`.

### 4.1 Implementation Report Truth Reconciliation
Historical documentation in `JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md` had diverged from operational truth:
1. Prior notes claimed quests auto-completed directly to `SUCCEEDED` upon finishing their last step. Reconciled: Quests transition strictly to `AWAITING_VERIFICATION`, preserving the architectural authority of the C12 Completion Verifier.
2. Prior notes claimed crashed local mutations recovered as `FAILED_RETRYABLE`. Reconciled: Crashed in-flight mutations register as `UNKNOWN_COMMIT` to prevent dangerous duplicate writes.
3. Prior notes claimed rebooted quest steps reset to `PENDING`. Reconciled: Quest steps reconcile directly against `OperationLedger` records to prevent duplicate execution.

### 4.2 Direct ACTION Retry Identity Proof (Test 12)
Added Test 12 in `tests/jarvis-core/operation-ledger.test.ts` to prove that single-step direct mutations enforce exact idempotency semantics:
- **Same turn + same slot + same capability + identical args**: Generates identical `operationId`, returns `CACHED` result from ledger without re-executing handler.
- **Same operation + changed args**: Rejected with `CONFLICT` (`INPUT_HASH_MISMATCH`), preventing argument tampering.
- **New turn with identical intent**: Generates distinct `operationId` (`opId2 !== opId1`), permitting legitimate repeat actions.

### 4.3 Canonical Status Vocabulary Unification
Updated `lib/jarvis-core/types.ts` to provide canonical vocabulary and normalization helpers:
- `StepStatus`: `PENDING`, `READY`, `WAITING_FOR_CONFIRMATION`, `RUNNING`, `COMPLETED`, `BLOCKED_WITH_REASON`, `FAILED_RETRYABLE`, `FAILED_FINAL`, `UNKNOWN_COMMIT`, `CANCELLED`.
- `QuestStatus`: `CREATED`, `NEEDS_CLARIFICATION`, `WAITING_FOR_CONFIRMATION`, `READY`, `RUNNING`, `AWAITING_VERIFICATION`, `PARTIALLY_COMPLETED`, `COMPLETED`, `BLOCKED`, `FAILED`, `CANCELLED`.
- Helper functions: `normalizeStepStatus()`, `normalizeQuestStatus()`, `isStepSuccessful()`, `isQuestSuccessful()`.

---

## 5. STAGE 3: PHASE 2 MULTI-STEP ORCHESTRATION (CHECKPOINTS C9 → C13)

Phase 2 delivered the multi-step execution engine, replacing monolithic loops with machine-planned acyclic graphs.

### 5.1 Checkpoint C9: Structured DAG Planner
- **Commit**: `5a74148` (`feat(core-v2): add structured quest planner`)
- **Files Created**:
  - `lib/jarvis-core/planner/types.ts` (187 lines): `ExecutionPlan`, `PlannerStep`, `StructuredArguments`, `StepOutputReference`, `CompletionCriterion`, `PLAN_LIMITS`.
  - `lib/jarvis-core/planner/references.ts` (200 lines): RFC 6901 JSON pointer evaluator with prototype pollution guards (`__proto__`, `constructor`, `prototype`).
  - `lib/jarvis-core/planner/schema.ts` (110 lines): Zod validation schemas for plan structures.
  - `lib/jarvis-core/planner/prompt.ts` (65 lines): Bounded prompt builder exposing **strictly routed capabilities**.
  - `lib/jarvis-core/planner/planner.ts` (309 lines): `StructuredPlanner` using Kahn's algorithm for topological ordering and cycle detection.
  - `lib/jarvis-core/planner/index.ts` (13 lines): Barrel export.
- **Key Invariants**:
  - *Zero Execution Side Effects*: Planner never executes tools or writes to the ledger.
  - *Strict Complexity Bounds*: `MAX_STEPS = 10`, `MAX_DEPTH = 5`, `MAX_FAN_OUT = 5`, `MAX_SERIALIZED_BYTES = 32 KB`.
  - *Typed Dataflow*: Inter-step arguments must use typed RFC 6901 JSON pointers (`{ $ref: { stepId, path } }`); code evaluation and string interpolation are strictly prohibited.
- **Test File**: `tests/jarvis-core/planner.test.ts` (22 unit tests, 100% green).

### 5.2 Checkpoint C10: Deterministic Plan Validator
- **Commit**: `7c0b321` (`feat(core-v2): add deterministic plan validator`)
- **Files Created / Modified**:
  - `lib/jarvis-core/planner/validator.ts` (515 lines): `DeterministicPlanValidator` verifying DAG acyclicity, capability registry presence, argument schemas via Zod, pointer integrity, and deriving trusted metadata.
  - `lib/jarvis-core/capabilities/registry.ts`: Added `get(id)` lookup alias.
- **Key Invariants**:
  - *Zero Model Authority*: The model's claims regarding safety or confirmation are ignored. The validator derives `actionClass`, `confirmationPolicy`, `idempotencyClass`, and `requiresConfirmation` directly from the Capability Registry.
  - *Static Schema Validation*: All literal arguments validated against capability Zod schemas before any step is scheduled.
- **Test File**: `tests/jarvis-core/plan-validator.test.ts` (20 unit tests, 100% green).

### 5.3 Checkpoint C11: Deterministic DAG Executor
- **Commit**: `121b402` (`feat(core-v2): add deterministic dag executor`)
- **Files Created / Modified**:
  - `lib/jarvis-core/executor/types.ts` (115 lines): `StepExecutionRecord`, `ConfirmationRequest`, `ConfirmationPreview`, `ExecutionResult`.
  - `lib/jarvis-core/executor/step-executor.ts` (281 lines): `SingleStepExecutor` resolving `$ref` pointers, generating previews, claiming operations in ledger, executing capabilities via safe boundary, and recording results.
  - `lib/jarvis-core/executor/executor.ts` (485 lines): `DeterministicDAGExecutor` providing wave-based topological scheduling, read concurrency (limit 4), mutation serialization (limit 1), cascading blockage propagation, and crash recovery.
  - `lib/jarvis-core/executor/index.ts` (9 lines): Barrel export.
  - `lib/jarvis-core/ledger/ledger.ts`: Added `getOperationByQuestStep(questId, stepId)` for multi-index lookup.
- **Key Invariants**:
  - *Read Parallelization & Mutation Serialization*: `READ` steps run concurrently in waves (up to 4). `MUTATION` and `DESTRUCTIVE` steps execute strictly one at a time.
  - *Two-Phase Confirmation Boundary*: Destructive operations halt execution, issue unforgeable `ConfirmationRequest`, and resume only upon affirmative token presentation.
  - *Cascading Blockage*: When a step fails permanently or is marked `UNKNOWN_COMMIT`, all downstream transitive dependents transition to `BLOCKED_WITH_REASON`.
  - *Executor-to-Verifier Boundary*: Successful executor execution terminates in `AWAITING_VERIFICATION`, never `COMPLETED`.
- **Test File**: `tests/jarvis-core/executor.test.ts` (10 unit & concurrency stress tests, 100% green).

### 5.4 Checkpoint C12: Terminal Completion Verifier
- **Commit**: `7a1c0f5` (`feat(core-v2): add terminal completion verifier`)
- **Files Created / Modified**:
  - `lib/jarvis-core/verifier/types.ts` (70 lines): `TerminalQuestStatus`, `CriterionEvaluationResult`, `StepVerificationResult`, `PlanVerificationResult`.
  - `lib/jarvis-core/verifier/criteria-evaluator.ts` (134 lines): `CriteriaEvaluator` checking `CAPABILITY_SUCCEEDED`, `OUTPUT_PRESENT` (with JSON pointer inspection), `CONFIRMATION_ACCEPTED`, and `DEPENDENCY_RESOLVED`.
  - `lib/jarvis-core/verifier/verifier.ts` (196 lines): `TerminalCompletionVerifier` evaluating criteria, deriving terminal status (`COMPLETED`, `PARTIALLY_COMPLETED`, `BLOCKED`, `FAILED`), and calling `questEngine.verifyAndCompleteQuest()`.
  - `lib/jarvis-core/verifier/index.ts` (9 lines): Barrel export.
- **Key Invariants**:
  - *Sole Terminal Authority*: Only the verifier has authority to transition quests to `COMPLETED` or `PARTIALLY_COMPLETED`.
  - *Evidence-Based Verification*: Criteria are checked against real outputs and ledger evidence. Hallucinated step completion without ledger proof is rejected.
  - *Optional Step Support*: Non-required step failures allow `PARTIALLY_COMPLETED` rather than failing the entire quest.
- **Test File**: `tests/jarvis-core/verifier.test.ts` (5 unit tests, 100% green).

### 5.5 Checkpoint C13: Bounded Quest Replanner
- **Commit**: `545188b` (`feat(core-v2): add bounded quest replanner`)
- **Files Created / Modified**:
  - `lib/jarvis-core/planner/replanner.ts` (244 lines): `ControlledReplanner` with trigger detection, subgraph pruning, immutable history preservation, and composite plan revalidation.
  - `lib/jarvis-core/planner/types.ts`: Extended with `MAX_REPLAN_ATTEMPTS = 2`, `ReplanTriggerType`, `ReplanRequest`, `ReplanResult`.
- **Key Invariants**:
  - *Strict 2-Attempt Budget*: Quests reaching 2 replan attempts transition immediately to `FAILED`, preventing infinite loops.
  - *Material Triggers Only*: Replanning permitted only for `MISSING_PREREQUISITE`, `USER_REDIRECTION`, `EXTERNAL_STATE_MISMATCH`, or `RECOVERABLE_STEP_FAILURE`.
  - *Immutable Completed History*: Completed steps and their ledger records cannot be deleted or re-executed.
  - *Subgraph Pruning*: Prunes failed steps and their downstream dependents while preserving independent parallel branches.
- **Test File**: `tests/jarvis-core/replanner.test.ts` (9 unit tests, 100% green).

### 5.6 Cross-Checkpoint Integration Gate (C9–C13): 20 Canonical Scenarios
- **Commits**: `46e22c5`, `9566b63`, `c753893`
- **File Created**: `tests/jarvis-core/integration-c9-c13.test.ts` (1,349 lines)
- **Verified Scenarios**:
  1. *Scenario 1: End-to-End Orchestration*: Planner $\to$ Validator $\to$ Executor $\to$ Verifier $\to$ SQLite QuestEngine.
  2. *Scenario 2: Parallel Read Fan-Out*: 3 concurrent reads (`research.search`, `tasks.list`, `memory.search`) before sequential mutation (`tasks.create`).
  3. *Scenario 3: Two-Phase Confirmation*: Destructive step pauses with `ConfirmationRequest`; inspects preview; resumes upon unforgeable approval.
  4. *Scenario 4: Argument Passing via JSON Pointers*: Dataflow across 3 sequential steps using RFC 6901 pointers without code evaluation.
  5. *Scenario 5: Replan Trigger & Patch Execution*: Step fails on missing prerequisite; replanner prunes failed branch, patches new steps, and succeeds.
  6. *Scenario 6: Replan Budget Exhaustion*: 2-attempt budget enforced; 3rd attempt fails quest cleanly.
  7. *Scenario 7: Idempotent Ledger Deduplication*: Replay of identical step returns `CACHED` without re-invoking handler.
  8. *Scenario 8: Crash Recovery Mid-Execution*: Re-instantiated Executor reconciles against ledger and resumes at pending step.
  9. *Scenario 9: UNKNOWN_COMMIT Safe Blockage*: Unconfirmed external mutation safely blocks downstream dependents; Verifier assigns `BLOCKED`.
  10. *Scenario 10: ACTION vs QUEST Isolation*: Direct action and DAG steps run against same SQLite database with distinct key namespaces (`dk_` vs `qop_`) without collision.
  11. *Scenario 11: Multi-Domain Pipeline*: Cross-domain chaining across `tasks`, `research`, and `notification` domains.
  12. *Scenario 12: Cascading Error Propagation*: Fatal failure in required step cascades blockage to all dependents; status resolves to `FAILED`.
  13. *Scenario 13: Optional Step Failure*: Failure of optional step permits `PARTIALLY_COMPLETED` status.
  14. *Scenario 14: Mid-Flight Cancellation*: `AbortSignal` cleanly aborts execution, cancelling pending steps.
  15. *Scenario 15: Structural Cycle Rejection*: Kahn's algorithm catches cycles during validation before execution.
  16. *Scenario 16: Schema & Unrouted Rejection*: Zod violations and unrouted capabilities rejected with structured error codes.
  17. *Scenario 17: Forward Reference Rejection*: Pointers referencing future steps or undeclared dependencies rejected.
  18. *Scenario 18: Prototype Pollution Defense*: Blocks paths containing `__proto__`, `constructor`, or `prototype`.
  19. *Scenario 19: Plan Complexity Limits*: Plans exceeding steps (>10), depth (>5), or fan-out (>5) rejected.
  20. *Scenario 20: 25-Run Concurrent Stress Test*: 25 simultaneous DAG plans run concurrently against SQLite WAL with 0 race conditions, 0 deadlocks, and 100% data integrity.

---

## 6. STAGE 4: PRE-PHASE-4 RUNTIME CONTRACT REPAIR (GATES A THROUGH J)

Prior to implementing C14 provider routing, an exhaustive runtime contract hardening was executed in commit `6663ef6` to resolve subtle cross-module contract inconsistencies.

| Gate | Repair Objective | Files Modified / Added | Verification Result |
| :--- | :--- | :--- | :---: |
| **Gate A** | **Cryptographic Confirmation Security**: Eliminate `confirmedSteps` bypass; enforce unforgeable C4 token verification in `SingleStepExecutor` | `lib/jarvis-core/executor/step-executor.ts`, `lib/jarvis-core/executor/executor.ts`, `lib/jarvis-core/executor/types.ts` | **PASS** |
| **Gate B** | **Canonical Input Normalization Equivalence**: Guarantee `preview args === ledger hash === handler args`; alias pre-normalization | `lib/jarvis-core/capabilities/normalizer.ts`, `lib/jarvis-core/capabilities/index.ts` | **PASS** |
| **Gate C** | **UNKNOWN_COMMIT Persistence**: Persist uncertain external mutations with `isUnknownCommit: true`; safely block downstream steps | `lib/jarvis-core/executor/step-executor.ts`, `lib/jarvis-core/ledger/ledger.ts` | **PASS** |
| **Gate D** | **Durable Quest Plan Persistence**: SQLite `quest_plans` table; `persistPlan`, `getActivePlan`, `resumeFromDatabase` | `lib/jarvis-core/quest/schema.ts`, `lib/jarvis-core/quest/engine.ts`, `lib/jarvis-core/executor/executor.ts` | **PASS** |
| **Gate E** | **Direct ACTION Runtime & Resolver**: Single-step mutation pipeline bypassing graph overhead; regex candidate extraction | `lib/jarvis-core/action/types.ts`, `resolver.ts`, `runtime.ts`, `index.ts` | **PASS** |
| **Gate F** | **Intent Fast-Path Target Correctness**: Exact resource routing for GitHub, Apple/Google Calendar, Telegram, Obsidian, Wake Words | `lib/jarvis-core/intent/classifier.ts` | **PASS** |
| **Gate G** | **Preview Schema Alignment**: Match exact runtime schemas for Google Calendar (`startISO`, `summary`), Apple Calendar, GitHub, Gmail | `lib/jarvis-core/safety/preview.ts` | **PASS** |
| **Gate H** | **Replanner Budget & Safety**: Cap replanning at 2 attempts; prevent cycles and replan loops | `lib/jarvis-core/planner/replanner.ts` | **PASS** |
| **Gate I** | **Read-Only State Purity**: Ensure READ_ONLY operations remain side-effect free | `lib/jarvis-core/capabilities/definitions/` | **PASS** |
| **Gate J** | **Capability Abortability Contract**: Metadata distinguishing cooperative async vs synchronous SQLite atomic execution | `lib/jarvis-core/capabilities/types.ts`, `lib/jarvis-core/capabilities/definitions/` | **PASS** |

**Contract Repair Test Suite**: `tests/jarvis-core/repair-contract-gates.test.ts` (8 automated tests covering Gates A through J, 100% green).

---

## 7. STAGE 5: PHASE 3 PROVIDER ROUTING, FINALIZATION & RUNTIME COMPOSITION (C14 → C16)

Phase 3 completed the core runtime loop, connecting provider management, grounded response finalization, and SSE streaming.

### 7.1 Checkpoint C14: Provider-Role Router & Global Deadline Model
- **Commit**: `4464717` (`feat(core-v2): implement provider-role router and global deadline model (C14)`)
- **Files Created**:
  - `lib/jarvis-core/providers/types.ts` (95 lines): `ModelAdapter`, `ModelProviderId`, `ProviderRole` (`CHAT`, `ACTION_RESOLVER`, `PLANNER`, `REPLANNER`, `FINALIZER`), `RoleRoutingConfig`, `ProviderHealthStatus`, `ModelRequestOptions`, `ModelResponse`, `ObjectGenerationResult`.
  - `lib/jarvis-core/providers/deadline.ts` (140 lines): `TurnDeadline` dual-threshold deadline model (`hardDeadline` + `softDeadline` wrap-up buffer), child signal propagation, monotonic elapsed/remaining tracking.
  - `lib/jarvis-core/providers/mock.ts` (110 lines): `MockModelAdapter` with zero-network offline determinism, canned response queues, latency simulation, and failure triggers.
  - `lib/jarvis-core/providers/router.ts` (280 lines): `ProviderRoleRouter` with health tracking (`HEALTHY`, `DEGRADED`, `COOLDOWN`, `OFFLINE`), automatic failover to fallback models, 30s circuit breaker cooldown on consecutive errors or rate limits (429/503), and deadline propagation.
  - `lib/jarvis-core/providers/index.ts` (14 lines): Barrel export.
- **Key Invariants**:
  - *Single Global Deadline*: Exactly one deadline governs the entire user turn. Stacked watchdog timeouts are strictly prohibited.
  - *100% Offline Determinism*: All tests execute deterministically without external network requests or live API keys.
- **Test File**: `tests/jarvis-core/provider-router.test.ts` (16 unit tests, 100% green).

### 7.2 Checkpoint C15: Grounded Finalizer & Response Generator
- **Commit**: `84889fc` (`feat(core-v2): implement grounded finalizer and response generator (C15)`)
- **Files Created**:
  - `lib/jarvis-core/finalizer/types.ts` (60 lines): `FinalizationFacts`, `StepFact`, `PendingConfirmationFact`, `FinalizerResponse`, `FinalizerTurnStatus`.
  - `lib/jarvis-core/finalizer/redaction.ts` (95 lines): Secret and credential redaction engine scrubbing OpenAI keys (`sk-...`), Bearer tokens, JWTs, GitHub PATs, Google API keys, Telegram bot tokens, Slack tokens, private keys, and URL basic-auth passwords.
  - `lib/jarvis-core/finalizer/deterministic.ts` (175 lines): Zero-model deterministic fallback synthesizer providing truthful templates for direct action outcomes, multi-step plan completions, partial failures, confirmation alerts, and errors.
  - `lib/jarvis-core/finalizer/finalizer.ts` (165 lines): `GroundedFinalizer` integrating `ProviderRoleRouter` under strict zero-tool prompts; automatically falls back to deterministic synthesis on soft deadline expiration, timeout, or model failure.
  - `lib/jarvis-core/finalizer/index.ts` (12 lines): Barrel export.
- **Key Invariants**:
  - *Anti-Hallucination Grounding*: If an action is not committed in `OperationLedger`, completion is never claimed.
  - *Deterministic Confirmation Guard*: When confirmation is required, the finalizer automatically returns deterministic template output to prevent model hallucination or argument distortion.
- **Test File**: `tests/jarvis-core/finalizer.test.ts` (12 unit tests, 100% green).

### 7.3 Checkpoint C16: Core Runtime Composition, Structured Progress & SSE Streaming
- **Commit**: `7b1913a` (`feat(core-v2): implement core runtime composition, structured progress, and SSE streaming (C16)`)
- **Files Created**:
  - `lib/jarvis-core/streaming/types.ts` (110 lines): `CoreStreamEventType`, `RuntimePipelineStage`, payload contracts (`turn_started`, `stage_changed`, `intent_classified`, `plan_created`, `step_started`, `step_progress`, `step_completed`, `confirmation_required`, `response_chunk`, `turn_completed`, `error`), and `StreamSink`.
  - `lib/jarvis-core/streaming/events.ts` (125 lines): W3C SSE standard string formatter (`formatSseMessage`) and event factory helpers.
  - `lib/jarvis-core/streaming/buffer.ts` (85 lines): `EventReplayBuffer` with monotonic sequence IDs (`1, 2, 3...`) and client reconnect replay (`getEventsSince`).
  - `lib/jarvis-core/streaming/index.ts` (10 lines): Barrel export.
  - `lib/jarvis-core/runtime/types.ts` (55 lines): `RuntimeTurnInput`, `RuntimeTurnResult`.
  - `lib/jarvis-core/runtime/runtime.ts` (390 lines): `JarvisCoreRuntime` composing fast-path classification, direct action runtime, DAG planner, safety policies, operation ledger, provider router, global deadline, grounded finalizer, and SSE event streaming.
  - `lib/jarvis-core/runtime/index.ts` (10 lines): Barrel export.
- **Key Invariants**:
  - *Monotonic Sequence IDs*: Stream events emit strictly ascending IDs (`id: 1\n`, `id: 2\n`, `id: 3\n`), enabling client gap detection and replay.
  - *Unified Lifecycle Pipeline*: Standardized transition through stages: `CLASSIFYING` $\to$ `PLANNING` $\to$ `EXECUTING` $\to$ `FINALIZING` $\to$ `COMPLETED` / `FAILED`.
- **Test File**: `tests/jarvis-core/core-runtime.test.ts` (12 unit & integration tests, 100% green).

---

## 8. MASTER INVENTORY OF ALL FILE CHANGES, ADDITIONS & REMOVALS

### 8.1 Files Created in Core V2 (`lib/jarvis-core/`)

| File Path | Lines | Subsystem / Role |
| :--- | :---: | :--- |
| `lib/jarvis-core/types.ts` | 339 | Foundation domain types, identities, statuses, vocabularies |
| `lib/jarvis-core/capabilities/types.ts` | 185 | Domain definitions, metadata contracts, candidate info |
| `lib/jarvis-core/capabilities/registry.ts` | 275 | Authoritative singleton registry with querying and filtering |
| `lib/jarvis-core/capabilities/diagnostics.ts` | 130 | Safe developer inspection utility with zero secret leakage |
| `lib/jarvis-core/capabilities/json.ts` | 115 | Deterministic JSON serialization and circular reference guards |
| `lib/jarvis-core/capabilities/result.ts` | 75 | `CapabilityResult<T>` discriminated union |
| `lib/jarvis-core/capabilities/safe-boundary.ts` | 240 | Universal `executeCapabilitySafely` gateway with 14 error codes |
| `lib/jarvis-core/capabilities/normalizer.ts` | 165 | Canonical input normalizer and schema alias resolver |
| `lib/jarvis-core/capabilities/definitions/local.ts` | 310 | 18 local capabilities (tasks, memory, skills, wake words, preferences) |
| `lib/jarvis-core/capabilities/definitions/research.ts` | 85 | 2 research capabilities (webSearch, fetchPage) |
| `lib/jarvis-core/capabilities/definitions/connectors.ts` | 420 | 27 connector capabilities (GitHub, Google, Apple, Telegram, Obsidian) |
| `lib/jarvis-core/capabilities/definitions/unregistered.ts` | 120 | 4 formally classified candidates (deploySkill, deleteSkill, etc.) |
| `lib/jarvis-core/capabilities/definitions/index.ts` | 45 | Canonical aggregator for all 47 capability definitions |
| `lib/jarvis-core/capabilities/index.ts` | 25 | Barrel export for capability subsystem |
| `lib/jarvis-core/safety/types.ts` | 95 | ActionClass, PolicyDecision, ConfirmationToken types |
| `lib/jarvis-core/safety/tokens.ts` | 80 | Cryptographic HMAC-SHA256 confirmation token generator |
| `lib/jarvis-core/safety/preview.ts` | 170 | Schema-aligned preview generator producing human-readable diffs |
| `lib/jarvis-core/safety/policy.ts` | 165 | `ActionPolicyManager` evaluating safety tiers and tokens |
| `lib/jarvis-core/safety/index.ts` | 15 | Barrel export for safety subsystem |
| `lib/jarvis-core/ledger/types.ts` | 95 | OperationRecord, OperationStatus, Claim contracts |
| `lib/jarvis-core/ledger/schema.ts` | 70 | SQLite DDL for `operations` ledger table |
| `lib/jarvis-core/ledger/canonical.ts` | 95 | Deterministic SHA-256 operation hashing and dedupe keys |
| `lib/jarvis-core/ledger/ledger.ts` | 340 | `OperationLedger` atomic state machine and query engine |
| `lib/jarvis-core/ledger/index.ts` | 15 | Barrel export for ledger subsystem |
| `lib/jarvis-core/intent/types.ts` | 75 | IntentClassification, AmbiguityAssessment types |
| `lib/jarvis-core/intent/classifier.ts` | 215 | Deterministic fast-path regex intent classifier |
| `lib/jarvis-core/intent/ambiguity.ts` | 145 | Ambiguity scoring and targeted clarification generator |
| `lib/jarvis-core/intent/index.ts` | 15 | Barrel export for intent subsystem |
| `lib/jarvis-core/routing/types.ts` | 55 | RoutingDecision and RouterConfig contracts |
| `lib/jarvis-core/routing/router.ts` | 185 | Strategy E hybrid capability router with fail-open fallback |
| `lib/jarvis-core/routing/shadow.ts` | 120 | Live shadow evaluator comparing against 47-tool baseline |
| `lib/jarvis-core/routing/index.ts` | 15 | Barrel export for routing subsystem |
| `lib/jarvis-core/quest/types.ts` | 80 | QuestRecord, QuestStepRecord, Recovery contracts |
| `lib/jarvis-core/quest/schema.ts` | 95 | SQLite DDL for `quests`, `quest_steps`, and `quest_plans` |
| `lib/jarvis-core/quest/engine.ts` | 310 | `QuestEngine` persistence and crash recovery reconciliation |
| `lib/jarvis-core/quest/index.ts` | 15 | Barrel export for quest subsystem |
| `lib/jarvis-core/planner/types.ts` | 187 | ExecutionPlan, PlannerStep, Criteria, Limits contracts |
| `lib/jarvis-core/planner/references.ts` | 200 | RFC 6901 JSON pointer evaluator with prototype pollution guards |
| `lib/jarvis-core/planner/schema.ts` | 110 | Zod validation schemas for plan structures |
| `lib/jarvis-core/planner/prompt.ts` | 65 | Bounded prompt builder exposing strictly routed capabilities |
| `lib/jarvis-core/planner/planner.ts` | 309 | `StructuredPlanner` with Kahn's cycle detection |
| `lib/jarvis-core/planner/validator.ts` | 515 | `DeterministicPlanValidator` deriving safety metadata |
| `lib/jarvis-core/planner/replanner.ts` | 244 | `ControlledReplanner` with 2-attempt budget and pruning |
| `lib/jarvis-core/planner/index.ts` | 15 | Barrel export for planner subsystem |
| `lib/jarvis-core/executor/types.ts` | 115 | StepExecutionRecord, ConfirmationRequest contracts |
| `lib/jarvis-core/executor/step-executor.ts` | 340 | `SingleStepExecutor` resolving pointers and claiming ledger |
| `lib/jarvis-core/executor/executor.ts` | 510 | `DeterministicDAGExecutor` wave scheduler and crash recovery |
| `lib/jarvis-core/executor/index.ts` | 10 | Barrel export for executor subsystem |
| `lib/jarvis-core/verifier/types.ts` | 70 | TerminalQuestStatus, CriterionEvaluation contracts |
| `lib/jarvis-core/verifier/criteria-evaluator.ts` | 134 | `CriteriaEvaluator` checking capabilities, outputs, tokens |
| `lib/jarvis-core/verifier/verifier.ts` | 196 | `TerminalCompletionVerifier` sole completion authority |
| `lib/jarvis-core/verifier/index.ts` | 10 | Barrel export for verifier subsystem |
| `lib/jarvis-core/action/types.ts` | 65 | Direct action input, candidate, and execution outcome types |
| `lib/jarvis-core/action/resolver.ts` | 135 | `ActionArgumentResolver` extracting parameters via regex/json |
| `lib/jarvis-core/action/runtime.ts` | 210 | `DirectActionRuntime` single-step execution pipeline |
| `lib/jarvis-core/action/index.ts` | 10 | Barrel export for action subsystem |
| `lib/jarvis-core/providers/types.ts` | 95 | ModelAdapter, ProviderRole, HealthStatus contracts |
| `lib/jarvis-core/providers/deadline.ts` | 140 | `TurnDeadline` dual-threshold deadline model |
| `lib/jarvis-core/providers/mock.ts` | 110 | `MockModelAdapter` for offline determinism |
| `lib/jarvis-core/providers/router.ts` | 280 | `ProviderRoleRouter` with health tracking and failover |
| `lib/jarvis-core/providers/index.ts` | 15 | Barrel export for providers subsystem |
| `lib/jarvis-core/finalizer/types.ts` | 60 | FinalizationFacts, FinalizerResponse contracts |
| `lib/jarvis-core/finalizer/redaction.ts` | 95 | Secret redaction engine (API keys, PATs, Bearer tokens) |
| `lib/jarvis-core/finalizer/deterministic.ts` | 175 | Truthful zero-model response synthesizer |
| `lib/jarvis-core/finalizer/finalizer.ts` | 165 | `GroundedFinalizer` anti-hallucination engine |
| `lib/jarvis-core/finalizer/index.ts` | 12 | Barrel export for finalizer subsystem |
| `lib/jarvis-core/streaming/types.ts` | 110 | Stream event types, stage definitions, and sink contracts |
| `lib/jarvis-core/streaming/events.ts` | 125 | W3C SSE standard string formatter and event factories |
| `lib/jarvis-core/streaming/buffer.ts` | 85 | `EventReplayBuffer` with monotonic sequence IDs |
| `lib/jarvis-core/streaming/index.ts` | 10 | Barrel export for streaming subsystem |
| `lib/jarvis-core/runtime/types.ts` | 55 | `RuntimeTurnInput`, `RuntimeTurnResult` contracts |
| `lib/jarvis-core/runtime/runtime.ts` | 390 | `JarvisCoreRuntime` master composition engine |
| `lib/jarvis-core/runtime/index.ts` | 10 | Barrel export for runtime subsystem |

### 8.2 Test Files Created (`tests/jarvis-core/`)

| Test File Path | Tests | Lines | Scope / Invariants Verified |
| :--- | :---: | :---: | :--- |
| `tests/jarvis-core/types.test.ts` | 15 | 185 | Nominal branded IDs, execution modes, JSON serialization, status helpers |
| `tests/jarvis-core/capabilities.test.ts` | 12 | 260 | Registry query integrity, 47 capabilities, 12 domains, candidate classification |
| `tests/jarvis-core/result-boundary.test.ts` | 39 | 430 | Safe boundary, 14 error codes, circular references, safe execution of all 47 tools |
| `tests/jarvis-core/safety-policy.test.ts` | 25 | 320 | Action classes, HMAC tokens, confirmation barriers, preview generation |
| `tests/jarvis-core/operation-ledger.test.ts` | 23 | 540 | SHA-256 dedupe, crash recovery, Test 12 direct action retry identity proof |
| `tests/jarvis-core/intent-analysis.test.ts` | 16 | 280 | Fast-path regex routing, ambiguity scoring, clarification questions |
| `tests/jarvis-core/capability-router.test.ts` | 23 | 310 | Strategy E tool pruning, shadow evaluation, 100% recall on 227 corpus |
| `tests/jarvis-core/quest-engine.test.ts` | 15 | 310 | SQLite quest lifecycle, step transitions, reboot recovery reconciliation |
| `tests/jarvis-core/integration-c4-c8.test.ts` | 9 | 360 | Cross-subsystem integration from classifier through ledger and quest engine |
| `tests/jarvis-core/planner.test.ts` | 22 | 720 | C9 DAG planning, Kahn's cycle detection, RFC 6901 pointers, graph bounds |
| `tests/jarvis-core/plan-validator.test.ts` | 20 | 623 | C10 plan validator, zero model authority, input schemas, prototype defense |
| `tests/jarvis-core/executor.test.ts` | 10 | 649 | C11 DAG executor, wave dispatch, parallel reads (4), serialized mutations (1) |
| `tests/jarvis-core/verifier.test.ts` | 5 | 313 | C12 completion verifier, ledger evidence checking, sole terminal authority |
| `tests/jarvis-core/replanner.test.ts` | 9 | 314 | C13 controlled replanning, 2-attempt budget, subgraph pruning, history lock |
| `tests/jarvis-core/integration-c9-c13.test.ts` | 20 | 1,349 | 20 canonical integration scenarios across the entire multi-step stack |
| `tests/jarvis-core/repair-contract-gates.test.ts` | 8 | 405 | Pre-Phase-4 contract repairs (Gates A through J) regression verification |
| `tests/jarvis-core/provider-router.test.ts` | 16 | 410 | C14 provider role router, TurnDeadline dual threshold, circuit breaker |
| `tests/jarvis-core/finalizer.test.ts` | 12 | 340 | C15 grounded finalizer, secret scrubber, deterministic fallback synthesizer |
| `tests/jarvis-core/core-runtime.test.ts` | 12 | 450 | C16 runtime composition, SSE streaming, replay buffer, direct actions |
| **TOTAL** | **311** | **7,868** | **19 test suites, 100% passing across all units and integration gates** |

### 8.3 Documentation & Governance Files

| Documentation File Path | Lines | Purpose |
| :--- | :---: | :--- |
| `JARVIS_PRE_FIX_FAILURE_ISOLATION_REPORT.md` | 384 | Empirical failure isolation, watchdog profiling, 18-run reproduction |
| `JARVIS_TOOL_CONTRACT_ROUTING_AUDIT.md` | 399 | Automated contract testing across 47 tools, exception & safety audit |
| `JARVIS_ORCHESTRATOR_AB_PRODUCTION_GATE.md` | 284 | 60-scenario benchmark of Architectures A, B, and C |
| `JARVIS_COMPREHENSIVE_AUDIT_REPORT.md` | 550 | Aggregated master audit synthesizing failures, contracts, and architecture |
| `JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md` | 855 | Checkpoints C0–C8 implementation and reconciliation record |
| `JARVIS_CORE_V2_MEGA_GOAL_C4_C8_LOG.md` | 225 | Detailed C4–C8 autonomous execution log |
| `JARVIS_CORE_V2_C9_C13_MASTER_SUMMARY.md` | 448 | Detailed C9–C13 orchestration engine master summary |
| `JARVIS_CORE_V2_MEGA_GOAL_C14_C16_LOG.md` | 102 | Detailed C14–C16 provider, finalizer, and runtime execution log |
| `JARVIS_CORE_V2_END_TO_END_MASTER_CHRONICLE.md` | *Current* | Complete chronological record aggregating all stages from start to finish |
| `tasks/ACTIVE_PLAN.md` | 240 | Roadmap tracking phases, checkpoints, acceptance criteria |
| `tasks/CHECKPOINT_LOG.md` | 492 | Authoritative ledger of validated checkpoints and commits |
| `tasks/DECISIONS.md` | 119 | Architecture Decision Records (ADRs 001 through 007) |
| `tasks/KNOWN_ISSUES.md` | 110 | Known issue tracker (ISSUE-001 through ISSUE-006) |
| `tasks/DEFERRED.md` | 135 | Deferral register (D-001 through D-014) |

### 8.4 Legacy V1 Isolation Verification
In strict accordance with ADR-001:
- Zero files in `lib/` (including `lib/agent.ts`, `lib/research.ts`, `lib/tasks.ts`, `lib/memory/`, `lib/connectors/`) were modified or removed.
- Production API route `app/api/chat/route.ts` remains 100% connected to legacy V1.
- Core V2 runs entirely in `lib/jarvis-core/`, guaranteeing zero regression to existing user features during development.

---

## 9. COMPLETE TEST SUITE INVENTORY & RESULTS (19 FILES, 311 TESTS)

All 19 test suites in `tests/jarvis-core/` were executed against SQLite in WAL mode:

```
Test Files  19 passed (19)
     Tests  311 passed (311)
  Duration  56.06s
```

### 9.1 Test Suite Breakdown Table

| Suite # | Test File Path | Tests | Duration | Key Invariants Verified | Status |
| :---: | :--- | :---: | :---: | :--- | :---: |
| 1 | `tests/jarvis-core/repair-contract-gates.test.ts` | 8 | 934ms | Pre-Phase-4 Gates A-J: Token enforcement, alias normalizer, `UNKNOWN_COMMIT` ledger persistence, SQLite `quest_plans`, direct action resolver, preview schemas, abortability classifications. | **PASS** |
| 2 | `tests/jarvis-core/result-boundary.test.ts` | 39 | 5,074ms | 14 error codes, circular reference interceptor, safe execution of all 47 capabilities without throwing uncaught exceptions. | **PASS** |
| 3 | `tests/jarvis-core/provider-router.test.ts` | 16 | 458ms | C14 ProviderRoleRouter: Health states, 30s circuit breaker, TurnDeadline dual threshold, child signal abort, fallback failover. | **PASS** |
| 4 | `tests/jarvis-core/operation-ledger.test.ts` | 23 | 162ms | SHA-256 operation hashing, atomic transitions, crash recovery replay caching, Test 12 direct action retry identity proof. | **PASS** |
| 5 | `tests/jarvis-core/integration-c9-c13.test.ts` | 20 | 405ms | 20 canonical cross-checkpoint scenarios: Read parallelization, confirmation pause, JSON pointer dataflow, replanner 2-attempt budget, crash recovery, 25-run concurrency stress. | **PASS** |
| 6 | `tests/jarvis-core/executor.test.ts` | 10 | 239ms | C11 DAG execution, wave topological scheduler, read concurrency (4), sequential mutations (1), cascading blockage propagation. | **PASS** |
| 7 | `tests/jarvis-core/plan-validator.test.ts` | 20 | 143ms | C10 plan validator, zero model authority override, input Zod schemas, Kahn cycle detection, prototype pollution guards. | **PASS** |
| 8 | `tests/jarvis-core/core-runtime.test.ts` | 12 | 139ms | C16 runtime composition, fast-path routing, direct actions, DAG execution, W3C SSE streaming, EventReplayBuffer reconnects. | **PASS** |
| 9 | `tests/jarvis-core/capabilities.test.ts` | 12 | 68ms | Registry integrity, 47 unique capabilities across 12 domains, ActionClass assignments, valid Zod schemas, unregistered candidate classification. | **PASS** |
| 10 | `tests/jarvis-core/capability-router.test.ts` | 23 | 63ms | Strategy E capability routing, $\le 12$ tools per turn, shadow evaluation against 47-tool baseline, 100% recall on 227-prompt corpus. | **PASS** |
| 11 | `tests/jarvis-core/integration-c4-c8.test.ts` | 9 | 56ms | C4-C8 foundation integration, end-to-end shadow evaluation, crash recovery across process restarts. | **PASS** |
| 12 | `tests/jarvis-core/verifier.test.ts` | 5 | 52ms | C12 terminal completion verifier, criteria inspection against ledger, optional step partial completion, anti-hallucination rejection. | **PASS** |
| 13 | `tests/jarvis-core/quest-engine.test.ts` | 15 | 61ms | SQLite quest lifecycle, step execution state, crash recovery reconciliation, status transitions. | **PASS** |
| 14 | `tests/jarvis-core/replanner.test.ts` | 9 | 21ms | C13 controlled replanning, 2-attempt budget, material failure triggers, immutable history preservation, subgraph pruning. | **PASS** |
| 15 | `tests/jarvis-core/planner.test.ts` | 22 | 59ms | C9 structured plan synthesis, Kahn's cycle detection, RFC 6901 pointers, graph bounds (steps $\le 10$, depth $\le 5$). | **PASS** |
| 16 | `tests/jarvis-core/intent-analysis.test.ts` | 16 | 71ms | C5 intent classification (`DIRECT_ACTION` vs `QUEST`), ambiguity detection, confidence scoring, clarification generator. | **PASS** |
| 17 | `tests/jarvis-core/types.test.ts` | 15 | 27ms | Canonical status vocabulary normalization (`normalizeStepStatus`, `normalizeQuestStatus`, success checks). | **PASS** |
| 18 | `tests/jarvis-core/safety-policy.test.ts` | 25 | 76ms | Action classification (`READ`, `MUTATION`, `DESTRUCTIVE`), HMAC token generation and expiry, path safety guards. | **PASS** |
| 19 | `tests/jarvis-core/finalizer.test.ts` | 12 | 24ms | C15 grounded finalizer, secret scrubber, deterministic fallback synthesizer, anti-hallucination guarantees. | **PASS** |
| **TOTAL** | **19 Files** | **311** | **56.06s** | **All Invariants, Concurrency Controls, Safety Policies & Runtimes 100% Green** | **PASS** |

### 9.2 TypeScript & Production Build Verification
- **TypeScript Static Verification (`npx tsc --noEmit`)**:
  - Exit code: **0**
  - Errors: **0**
  - Warnings: **0**
- **Production Build Verification (`pnpm build`)**:
  - Compiler: Next.js 16.2.6 (Turbopack production build)
  - Duration: **28.8 seconds**
  - Dynamic Routes: **28 dynamic API routes compiled cleanly** with zero syntax, bundle, or type errors.

---

## 10. COMPREHENSIVE CATALOG OF BUGS, EDGE CASES & RESOLUTIONS

Throughout the investigation, implementation, and verification stages, twelve critical architectural bugs and friction points were identified, isolated, and permanently resolved:

### Bug 1: Premature Quest Completion in Executor
- **Failure Mode**: Early drafts of `DeterministicDAGExecutor.executePlan` attempted to mark `quest.status = "COMPLETED"` upon finishing the last DAG step.
- **Root Cause**: Blurred architectural boundary between execution and verification. If the executor marks a quest completed, it bypasses post-execution criteria checking (e.g. verifying external artifacts or outputs).
- **Resolution**: Constrained the executor strictly to terminate successful runs in `"AWAITING_VERIFICATION"`. Only the C12 `TerminalCompletionVerifier` has the authority to inspect evidence in the Operation Ledger and assign terminal `"COMPLETED"` or `"PARTIALLY_COMPLETED"`.

### Bug 2: QuestEngine SQLite Status Enum Mismatch
- **Failure Mode**: When `TerminalCompletionVerifier` synchronized with `QuestEngine`, SQLite threw a check constraint violation or broke backwards compatibility helpers like `isQuestSuccessful`.
- **Root Cause**: `TerminalCompletionVerifier` derived canonical status `"COMPLETED"`, whereas the SQLite database schema and legacy helpers expected `"SUCCEEDED"`.
- **Resolution**: Reconciled the mapping in `TerminalCompletionVerifier.verifyPlan`:
  ```typescript
  const questTerminal =
    finalStatus === "COMPLETED"
      ? "SUCCEEDED"
      : finalStatus === "PARTIALLY_COMPLETED"
        ? "PARTIALLY_COMPLETED"
        : "FAILED"
  this.questEngine.verifyAndCompleteQuest(plan.questId, questTerminal, summary)
  ```
  Both `"COMPLETED"` and `"SUCCEEDED"` are normalized to true by `isQuestSuccessful()`.

### Bug 3: Step Output Reference String Interpolation (`$ref` vs String)
- **Failure Mode**: In initial planning schemas, step output references were represented as flat string templates (e.g. `"${step_1.output.id}"`). This permitted unsafe string injection and prevented static schema validation.
- **Root Cause**: Lack of typed, structured reference specification.
- **Resolution**: Standardized on RFC 6901 JSON pointer objects:
  ```typescript
  export interface StepOutputReference {
    readonly stepId: PlanStepId
    readonly path: string // RFC 6901 JSON pointer, e.g. "/items/0/id"
  }
  ```
  This enables static syntax validation while deferring literal value validation until runtime resolution.

### Bug 4: Replanner Result Property & Attempt Count Off-by-One
- **Failure Mode**: Replanner unit tests failed because the returned plan was expected on `newPlan`, but initial drafts used `plan`. Furthermore, attempt 2 was allowed to replan instead of being blocked.
- **Root Cause**: Inconsistent naming in `ReplanResult` and `attemptCount >= MAX_REPLAN_ATTEMPTS` off-by-one check.
- **Resolution**: Standardized property name to `newPlan` in `ReplanResult`. Enforced strict check: `attemptCount >= MAX_REPLAN_ATTEMPTS` immediately marks `eligible: false` and rejects the replan request, failing the quest cleanly after 2 failed attempts.

### Bug 5: Ledger FailOperation Contract for Unknown Commits
- **Failure Mode**: During crash recovery simulation, when an external mutation timed out or broke connection, calling `ledger.failOperation` failed TypeScript compilation or marked the operation as retryable.
- **Root Cause**: `failOperation` required an explicit object: `{ operationId, errorCode, errorMessage, isRetryable, isUnknownCommit }`.
- **Resolution**: Updated all executor and crash-recovery handlers to pass `isUnknownCommit: true` and `isRetryable: false` when a mutation cannot be verified, causing downstream dependent steps to safely transition to `BLOCKED_WITH_REASON`.

### Bug 6: Optional Step Failure Causing Whole Plan Failure
- **Failure Mode**: In Scenario 13 of the integration gate, an optional step failure caused the entire quest to fail instead of completing partially.
- **Root Cause**: `PlannerStep.required` defaulted to `undefined` (treated as `true`), preventing the verifier from distinguishing optional steps from critical path steps.
- **Resolution**: Enforced strict boolean typing for `required: boolean` in `PlannerStep`. When an optional step fails, downstream steps dependent on it are skipped, and the verifier assigns `finalStatus: "PARTIALLY_COMPLETED"`.

### Bug 7: Prototype Pollution Defense in Step References
- **Failure Mode**: Security audit revealed that a malicious or hallucinated JSON pointer (e.g. `/constructor/prototype/polluted`) could theoretically pollute JavaScript Object prototypes during resolution.
- **Root Cause**: Blindly following property tokens during JSON pointer traversal in `references.ts`.
- **Resolution**: Implemented defensive token inspection in `resolveJsonPointer`:
  ```typescript
  if (token === "__proto__" || token === "constructor" || token === "prototype") {
    throw new Error(`Prototype pollution guard triggered for token "${token}"`)
  }
  ```
  Also added structural validation in `DeterministicPlanValidator` to reject such pointers before execution begins.

### Bug 8: Vitest Concurrency SQLite Lock Contention
- **Failure Mode**: When running all 19 test files in parallel in Vitest, worker threads concurrently created SQLite database files in the workspace root, causing `beforeEach` hook timeouts (`Error: Hook timed out in 10000ms`) in `repair-contract-gates.test.ts`.
- **Root Cause**: SQLite file lock contention on Windows when multiple Vitest worker threads initialize and tear down databases simultaneously in the same directory.
- **Resolution**: Running Vitest with `--fileParallelism=false` eliminates thread contention on disk I/O, allowing all 19 test files (311 tests) to execute sequentially and pass 100% green in 56 seconds.

### Bug 9: ConfirmationToken Branded String vs Object Typing
- **Failure Mode**: In `DirectActionRuntime`, attempting to access `outcome.confirmationToken.token` or passing an object caused TypeScript compilation errors.
- **Root Cause**: `ConfirmationToken` in `lib/jarvis-core/safety/types.ts` is a branded string (`string & { __brand: "ConfirmationToken" }`), NOT an object.
- **Resolution**: Treated `confirmationToken` as a string across `DirectActionRuntime`, `GroundedFinalizer`, and `ActionPolicyManager`, checking `typeof outcome.confirmationToken === "string"`.

### Bug 10: Action Execution Status Alignment
- **Failure Mode**: In early iterations of `JarvisCoreRuntime`, action outcomes were compared against `"SUCCEEDED"` or `"PAUSED_FOR_CONFIRMATION"`, causing status mismatches.
- **Root Cause**: `DirectActionRuntime.executeAction` returns `ActionExecutionOutcome` with statuses: `"COMPLETED"`, `"CONFIRMATION_REQUIRED"`, `"NEEDS_CLARIFICATION"`, `"BLOCKED"`, `"FAILED"`.
- **Resolution**: Standardized `JarvisCoreRuntime` to match exact `ActionExecutionOutcome` statuses, routing `"CONFIRMATION_REQUIRED"` directly to the deterministic finalizer.

### Bug 11: OperationLedger Return Typing in Direct Action Runtime
- **Failure Mode**: `DirectActionRuntime` attempted to construct synthetic `committedOperations` for the finalizer using partial objects, triggering type mismatches.
- **Root Cause**: `GroundedFinalizer` expects `OperationRecord` from `lib/jarvis-core/ledger/types.ts`.
- **Resolution**: Populated `committedOperations` using `this.ledger.getOperation(outcome.operationId)` directly, ensuring full fidelity of dedupe keys, hashes, and timestamps.

### Bug 12: AbortSignal & Timeout Leakage in Local Try/Catch Blocks
- **Failure Mode**: In `JarvisCoreRuntime`, local try/catch blocks around conversational `CHAT` execution swallowed deadline timeouts, converting them to generic model errors instead of aborting the turn.
- **Root Cause**: Catch blocks caught all errors without inspecting abort codes.
- **Resolution**: Added explicit rethrow guards:
  ```typescript
  if (e?.code === "TIMEOUT" || deadline.isExpired() || input.signal?.aborted) {
    throw e
  }
  ```
  This ensures that global turn deadlines propagate cleanly to the stream sink.

---

## 11. HARD-STOP COMPLIANCE & GOVERNANCE CHECKLIST

Every constraint established for this engineering cycle was strictly respected:

- [x] **Stoppage after Checkpoint C16 Strictly Enforced**: Checkpoint C17 (Phase 5 capability migration) has NOT been started.
- [x] **Production Route Untouched**: `app/api/chat/route.ts` remains 100% connected to legacy V1; no live user traffic is routed to Core V2.
- [x] **Branch Isolation**: All work was performed strictly on `jarvis-core-v2`. The branch has NOT been merged to `main`.
- [x] **Legacy Codebase Untouched**: Zero files in `lib/` were modified or deleted.
- [x] **Zero Forced Pushes**: All commits were pushed cleanly using standard git push operations.
- [x] **100% Offline Determinism**: All test suites run locally with zero external network calls or cloud API dependencies.
- [x] **Zero Model Authority Maintained**: All destructive operations require unforgeable cryptographic tokens derived from deterministic safety policies.

---

## 12. STAGE 10: PHASE 5 CAPABILITY MIGRATION ROADMAP (C17+)

With the Core V2 runtime substrate (C0 through C16) fully implemented and verified, the canonical remaining roadmap for Jarvis Core V2 proceeds through Phase 5: Capability Migration & Hardening:

### Canonical Remaining Roadmap (C17–C23)
- **C17 — Tasks / Memory / Research Migration**:
  - **Tasks Domain**: Migrate `tasks.create`, `tasks.list`, `tasks.complete`, `tasks.snooze`, `tasks.update`, `tasks.delete` to canonical Core V2 contracts with explicit operation IDs, ledger deduplication, and strict adherence to V1 product semantics (task soft-delete is explicitly rejected; V1 database deletions and updates are preserved without invented state transitions).
  - **Memory Domain**: Migrate `memory.save`, `memory.recall`, `memory.list`, `memory.delete` with sqlite-vec embedding verification, privacy scrubbing, and zero semantic execution suppression (arbitrary semantic execution suppression thresholds are rejected).
  - **Research Domain**: Migrate `research.web_search`, `research.fetch_page` with rate-limit backoff, citation grounding, deterministic offline mock test harness, and strict rejection of fake mock web search in production.
  - **Local Capabilities Audit**: Audit and formalize remaining local capabilities: Skills (`skills.list`, `skills.run`, `skills.build`), Wake Words (`wake_words.list`, `wake_words.add`, `wake_words.remove`), Preferences (`preferences.get`, `preferences.set`), and Feed (`feed.get_timeline`). The 4 internal candidates in `lib/skills.ts` (`deploySkillToGithub`, `deleteSkill`, `proposeRefinement`, `discoverSkillCandidates`) are formally audited and retained as internal/deferred candidates.
- **C18 — Read-Only Connector Migration**:
  - Migrate 14 read-only external connector capabilities across Google (5), GitHub (4), Apple (2), Obsidian (2), and Telegram (1).
  - Enforce AbortSignal propagation, structured auth/config failure normalization (`UNCONFIGURED`, `AUTH_REQUIRED`, `RATE_LIMITED`, `TIMEOUT`), and zero write side effects.
- **C19 — External Mutation Migration**:
  - Migrate 13 external mutation capabilities across Google (5), Apple (3), GitHub (2), Telegram (1), and Obsidian (2).
  - Enforce mandatory execution path, state-sensitive precondition checks, Obsidian path traversal safety (`../`), and UNKNOWN_COMMIT fault injection tests.
  - Architectural Guarantee: External mutations guarantee runtime-owned logical deduplication and replay protection; `UNKNOWN_COMMIT` is reported for external operations whose remote commit cannot be verified.
- **C20 — Comprehensive V1 vs V2 Evaluation**:
  - Full offline and fixture-based evaluation across all 47 capabilities comparing V1 vs V2 execution, performance, error reporting, and safety invariants (NOT live production shadow).
- **C21 — Production Canary**:
  - Controlled production canary routing 10% → 50% → 100% traffic behind `JARVIS_CORE_VERSION=v2`.
- **C22 — V2 Default**:
  - Core V2 promoted to default runtime; soak period and performance SLA verification.
- **C23 — Legacy V1 Removal**:
  - Safe decommission and deletion of legacy V1 files in `lib/`.

---
*End of Master Chronicle. Document compiled autonomously by Antigravity on September 21, 2026. All source files, commits, test runs, and verification metrics verified directly against repository state.*
