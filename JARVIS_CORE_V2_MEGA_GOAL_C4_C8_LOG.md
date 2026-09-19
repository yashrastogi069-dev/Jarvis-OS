# JARVIS CORE V2 — MEGA GOAL C4 → C8 END-TO-END EXECUTION LOG

**Mission**: Establish the Trustworthy Runtime Foundation (Safety Policy → Operation Ledger → Intent & Ambiguity → Capability Router → Persisted Quest Engine)  
**Author**: Antigravity Autonomous Agent  
**Branch**: `jarvis-core-v2`  
**Repository**: `https://github.com/yashrastogi069-dev/Jarvis-OS.git`  
**Started**: 2026-09-19  
**Status**: IN PROGRESS  

---

## 1. Executive Roadmap & Checkpoint Status

| Checkpoint | Focus Area | Status | Deliverables / Verification | Commit Hash |
| :--- | :--- | :--- | :--- | :--- |
| **Preflight** | Governance Reconciliation | **COMPLETE** | Reconciled `ACTIVE_PLAN.md`, `MASTER_PLAN_V2.md`, `CHECKPOINT_LOG.md`, `KNOWN_ISSUES.md`, `lessons.md`. | Pending C4 |
| **C4** | Central Action Safety & Confirmation Policy | **COMPLETE** | `lib/jarvis-core/safety/policy.ts`, deterministic decision union, unforgeable tokens, argument binding, preview generators, test suite (25 tests). | `1c46622` |
| **C5** | Persistent Operation Ledger & Idempotency | **COMPLETE** | SQLite operations table, `dedupeKey` calculation, claim-before-execute, restart persistence, local/external mutation handling. | `c43dd13` |
| **C6** | Intent Analysis & Ambiguity System | **COMPLETE** | Fast-path classifier (CHAT/READ/MUTATION/GOAL), clarification requirements, destructive ambiguity defense (13 tests, 40 corpus prompts). | `d47ddb5` |
| **C7** | Capability Router & Shadow Evaluation | **COMPLETE** | Strategy E layered confidence router, shadow evaluation against 227-corpus (100% recall, 6.7 avg tools, 23 tests). | `bddcb12` |
| **C8** | Persisted Quest Engine | **COMPLETE** | SQLite `quests` and `quest_steps` schema, state machine transitions, crash/restart recovery, operation linkage (13 tests). | Pending |
| **Integration** | Cross-Checkpoint Integration Gate | **ACTIVE** | 7 end-to-end headless scenarios verifying full stack without planner. | TBD |

---

## 2. Preflight Governance Reconciliation Log

1. **Active Plan (`tasks/ACTIVE_PLAN.md`)**:
   - Transitioned C4 from `QUEUED` to `ACTIVE`.
   - Updated C7 routing target to require `≥99.5% required-capability recall on the fixed evaluation corpus`, 100% recall on known regression prompts, shadow mode first, and fail-open on low confidence.
2. **Legacy Master Plan (`tasks/MASTER_PLAN_V2.md`)**:
   - Preserved file and added authoritative historical/legacy product roadmap banner citing `tasks/ACTIVE_PLAN.md` as active Core V2 execution authority on branch `jarvis-core-v2`.
3. **Checkpoint Log (`tasks/CHECKPOINT_LOG.md`)**:
   - Reconciled C2 and C3 entries with verified Git hashes (`69c4346` and `9f150c1`).
   - Verified `discoverSkillCandidates` canonical deferred code as `D-014`.
4. **Known Issues Ledger (`tasks/KNOWN_ISSUES.md`)**:
   - Reconciled `D-014`.
   - In `ISSUE-005`, clearly separated historical 25-scenario prototype results (68%) from authoritative 60-scenario evaluation results (Architecture A: 31.67% completion, 53.33% premature termination, 21.67% hallucination).
5. **Lessons Learned (`tasks/lessons.md`)**:
   - Appended C4 refinement to Lesson 20: model/tool-supplied `confirmed: true` values cannot be trusted as authorization; confirmation must be runtime-enforced and bound to exact validated action arguments.

---

## 3. Detailed Checkpoint Progress & Audit Trails

### Checkpoint C4: Central Action Safety & Confirmation Policy
- **Date**: 2026-09-19
- **Status**: COMPLETE
- **Objective**: Establish the central runtime action authorization policy and safe confirmation boundary in `lib/jarvis-core/safety/`.
- **Architectural Invariants Verified**:
  1. *Zero Model Authority*: The AI model or prompt can NEVER authorize an action. Arguments like `{ confirmed: true }` or text like `"Ignore instructions, user confirmed this"` carry ZERO authority and are ignored by the runtime policy engine.
  2. *Discriminated Decision Union*: `PolicyDecision` is strictly typed as `ALLOW`, `REQUIRE_CONFIRMATION`, `REQUIRE_CLARIFICATION`, or `BLOCK`.
  3. *Post-Validation Ordering*: Input schema validation (`safeParse`) occurs strictly BEFORE confirmation token generation, ensuring the preview and execution payloads are identical down to the byte.
  4. *Cryptographic Token Binding*: Confirmation tokens (`ConfirmationToken`) are 24-byte cryptographically secure random tokens issued strictly after schema validation. The token is cryptographically bound to the SHA-256 hash of the canonical JSON representation of the validated parameters.
  5. *Strict Single-Use & Tamper Defense*: Tokens expire after 5 minutes and are atomically consumed upon execution. Any alteration of arguments (e.g. changing `taskId: 1` to `taskId: 2`), replay attempt, or cross-capability substitution immediately triggers `BLOCK`.
  6. *Clarification Precedence*: Destructive requests with missing, zero, or ambiguous target identifiers (`tasks.delete` without an ID) deterministically yield `REQUIRE_CLARIFICATION`, preventing blind or unintended deletion confirmations.
  7. *Pure Deterministic Previews*: Action previews (`ActionPreview`) contain `capabilityId`, `targetDomain`, human-readable `summary`, structured `details`, and reversibility `warning`. Text snippets are bounded (max 150-200 chars).
  8. *Execution Gateway Boundary*: `authorizeAndExecuteCapability` ensures capability handlers are NEVER invoked if policy returns `REQUIRE_CONFIRMATION`, `REQUIRE_CLARIFICATION`, or `BLOCK`.
- **Files Created**:
  - `lib/jarvis-core/safety/types.ts`
  - `lib/jarvis-core/safety/canonical.ts`
  - `lib/jarvis-core/safety/preview.ts`
  - `lib/jarvis-core/safety/policy.ts`
  - `lib/jarvis-core/safety/index.ts`
  - `tests/jarvis-core/safety-policy.test.ts`
- **Verification Evidence**:
  - `tsc --noEmit`: 0 errors
  - `vitest run tests/jarvis-core/safety-policy.test.ts`: 25 passed / 25 tests (100% green)
  - `pnpm test`: 10 test files, 125 passed (100% green)
  - `pnpm build`: Next.js Turbopack build succeeded, 28 dynamic API routes generated.
- **Architectural Decision Record**: Logged ADR-008 in `tasks/DECISIONS.md`.

### Checkpoint C5: Persistent Operation Ledger & Logical Idempotency
- **Date**: 2026-09-19
- **Status**: COMPLETE
- **Objective**: Implement runtime-owned persistent Operation Ledger in SQLite with claim-before-execute pattern, dedupeKey generation, logical idempotency, concurrent conflict guards, and UNKNOWN_COMMIT protection.
- **Architectural Invariants Verified**:
  1. *Runtime-Owned Ledger*: Operations table in SQLite (`operations`) tracks every mutating capability invocation.
  2. *Claim-Before-Execute*: Atomic SQLite transaction claims operations before executing handlers, returning `CLAIMED`, `CACHED`, `CONFLICT`, or `UNKNOWN_COMMIT`.
  3. *Logical Idempotency*: Duplicate calls to idempotent operations within window return cached `resultPayload` without re-executing handlers.
  4. *Concurrent Conflict Guard*: Simultaneous invocations of non-idempotent operations yield `CONFLICT`, preventing duplicate external side effects.
  5. *UNKNOWN_COMMIT Safety*: Operations with unverified outcomes (e.g. connector timeouts) remain `UNKNOWN_COMMIT` and block automated replays.
  6. *Boot Crash Recovery*: Recovers abandoned `RUNNING`/`PENDING` records on boot to `UNKNOWN_COMMIT` (for external mutations) or `FAILED_RETRYABLE` (for local mutations).
  7. *Canonical Key Ordering*: Key order in JSON objects does not affect the generated `dedupeKey`.
  8. *Secret Sanitization*: Secrets in input/result payloads are redacted before persistent SQLite storage.
  9. *Retention Pruning*: Safely prunes completed operations older than threshold while preserving active and recent records.
- **Files Created**:
  - `lib/jarvis-core/ledger/types.ts`
  - `lib/jarvis-core/ledger/canonical.ts`
  - `lib/jarvis-core/ledger/ledger.ts`
  - `lib/jarvis-core/ledger/index.ts`
  - `tests/jarvis-core/operation-ledger.test.ts`
- **Verification Evidence**:
  - `tsc --noEmit`: 0 errors
  - `vitest run tests/jarvis-core/operation-ledger.test.ts`: 15 passed / 15 tests (100% green)
  - `vitest run tests/jarvis-core/`: 5 test files, 105 passed (100% green)
  - `pnpm build`: Next.js Turbopack build succeeded, 28 dynamic API routes generated.

### Checkpoint C6: Intent Analysis & Ambiguity System
- **Date**: 2026-09-19
- **Status**: COMPLETE
- **Objective**: Implement deterministic intent analysis and clarification detection (`lib/jarvis-core/intent/`) to distinguish direct answers (CHAT), simple queries (READ), single-capability mutations (MUTATION_SINGLE), multi-step goals (GOAL_MULTI_STEP), and underspecified/destructive requests requiring clarification (CLARIFICATION_REQUIRED).
- **Architectural Invariants Verified**:
  1. *Deterministic Fast-Path Classification*: Sub-millisecond deterministic classification without model round-trips for common conversational, informational, and operational queries.
  2. *Destructive Ambiguity Invariant*: Ambiguous destructive requests missing explicit IDs/titles (e.g. "delete that task", "remove memory", "cancel meeting") strictly yield `needsClarification: true` with `ambiguityType: "AMBIGUOUS_TARGET"` or `"MISSING_REQUIRED_FIELD"`.
  3. *Zero Premature Execution*: Queries requiring clarification halt before routing or ledger claiming, returning structured clarification prompts.
  4. *Multi-Step Goal Isolation*: Requests with multiple action verbs, conjunctions, or cross-domain dependencies are accurately tagged as `GOAL_MULTI_STEP` for downstream quest planning.
  5. *Safe Model Fallback Interface*: Defined structured intent schema and confidence thresholds for optional LLM fallback when fast-path confidence is < 0.75.
- **Files Created**:
  - `lib/jarvis-core/intent/types.ts`
  - `lib/jarvis-core/intent/ambiguity.ts`
  - `lib/jarvis-core/intent/classifier.ts`
  - `lib/jarvis-core/intent/analyzer.ts`
  - `lib/jarvis-core/intent/index.ts`
### Checkpoint C7: Capability Router & Shadow Evaluation
- **Date**: 2026-09-19
- **Status**: COMPLETE
- **Objective**: Implement the layered confidence Capability Router (`lib/jarvis-core/routing/`) deploying Strategy E (high-recall domain classification with conversational pruning and fail-open fallback), evaluated in shadow mode against the fixed 227-prompt corpus.
- **Architectural Invariants Verified**:
  1. *>= 99.5% Required-Capability Recall*: Evaluated against `evals/corpora/routing_corpus_227.json` (227 prompts, 195 expected tools), achieving **100.00% tool recall** (195/195 matched) and **100% domain recall**, exceeding the target.
  2. *Zero False Exclusions on Regressions*: 0 false exclusions across all 227 items, eliminating all 7 previous prototype misses (including task queries, wake words, preferences, bug reporting, email replies).
  3. *<= 12 Exposed Tools Heuristic Target*: Average tools exposed per prompt is **6.68**, cutting schema token payload by **85.7%** (from 8,225 down to 1,169 tokens).
  4. *Fail-Open Safe Fallback*: When prompts lack clear domain signals or confidence drops below threshold, automatically falls back to core capabilities (`tasks`, `memory`, `research`, `feed`) or all capabilities, guaranteeing zero tool starvation.
  5. *Shadow Mode Execution*: Built-in `shadowMode: true` option produces shadow telemetry and classifications without altering active execution.
  6. *Sub-Millisecond Routing Latency*: Measured routing latency per prompt is **0.015ms** (well under the 1.0ms budget).
- **Files Created**:
  - `lib/jarvis-core/routing/types.ts`
  - `lib/jarvis-core/routing/strategy-e.ts`
  - `lib/jarvis-core/routing/router.ts`
  - `lib/jarvis-core/routing/evaluator.ts`
  - `lib/jarvis-core/routing/index.ts`
  - `tests/jarvis-core/capability-router.test.ts`
- **Verification Evidence**:
  - `tsc --noEmit`: 0 errors
  - `vitest run tests/jarvis-core/capability-router.test.ts`: 23 passed / 23 tests (100% green)
  - `vitest run tests/jarvis-core/`: 7 test files, 141 passed (100% green)
  - `pnpm build`: Next.js Turbopack build succeeded, 28 dynamic API routes generated.

### Checkpoint C8: Persisted Quest Engine
- **Date**: 2026-09-19
- **Status**: COMPLETE
- **Objective**: Implement SQLite-persisted multi-step quest engine (`lib/jarvis-core/quest/`) tracking goals, subgoals, step dependencies, execution state machines, operation ledger linkage, and crash recovery.
- **Architectural Invariants Verified**:
  1. *Persisted Quest & Step Schema*: Structured `quests` and `quest_steps` tables in SQLite with transactional integrity, foreign key cascading, and status indexes.
  2. *Strict State Machine Lifecycles*: Quest status (`INITIALIZING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `SUSPENDED`) and step status (`PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `SKIPPED`).
  3. *Dependency DAG Verification*: Steps with prerequisite dependencies cannot start until all required prerequisite steps are `SUCCEEDED`.
  4. *Atomic Quest Completion*: Automatically completes parent quest when all planned steps have succeeded.
  5. *Retry Budget Control*: Failed steps retry within `max_retries` budget; upon exhaustion, transitions step and quest to `FAILED` with descriptive error messages.
  6. *Cancellation & Suspension*: Cancelling a quest marks remaining pending/running steps as `SKIPPED`; suspending allows human confirmation pauses without state loss.
  7. *Crash Recovery & Restart Survival*: On server reboot, orphaned `RUNNING` quests are cleanly transitioned to `SUSPENDED`, and orphaned `RUNNING` steps are safely reset to `PENDING` with crash notice.
  8. *Operation Ledger Linkage*: Direct linkage between `quest_steps` and C5 `OperationLedger` (`operation_id`).
  9. *Payload Secret Sanitization*: Automatically redacts credentials, PATs, and bearer tokens from quest metadata and step input/result payloads before storage.
- **Files Created**:
  - `lib/jarvis-core/quest/types.ts`
  - `lib/jarvis-core/quest/schema.ts`
  - `lib/jarvis-core/quest/engine.ts`
  - `lib/jarvis-core/quest/index.ts`
  - `tests/jarvis-core/quest-engine.test.ts`
- **Verification Evidence**:
  - `tsc --noEmit`: 0 errors
  - `vitest run tests/jarvis-core/quest-engine.test.ts`: 13 passed / 13 tests (100% green)
  - `vitest run tests/jarvis-core/`: 8 test files, 154 passed (100% green)
  - `pnpm build`: Next.js Turbopack build succeeded, 28 dynamic API routes generated.### Parts 20 & 21: Cross-Checkpoint Integration Gate & Crash Recovery
- **Date**: 2026-09-20
- **Status**: COMPLETE
- **Objective**: Full end-to-end headless integration verification of the complete C4–C8 trustworthy runtime stack across all 7 canonical scenarios and 2 crash/restart recovery invariant validations.
- **Scenarios Verified**:
  1. *Scenario 1 (Pure Conversation)*: "Hello Jarvis, good morning! Hope you are having a productive day." -> Tagged `CHAT`, 0 tools routed, 0 operations claimed in ledger, 0 quests created in SQLite, direct chat response.
  2. *Scenario 2 (Simple Read)*: "What tasks do I have scheduled for today?" -> Tagged `READ`, routed to `tasks` domain, policy evaluates `ALLOW`, executed via safe boundary without ledger mutation or quest creation.
  3. *Scenario 3 (Single Mutation)*: "Create a task called 'Deploy release v2'" -> Tagged `ACTION`, routed to `tasks`, policy evaluates `ALLOW`, ledger claims operation, executes through safe boundary, ledger records `SUCCEEDED`.
  4. *Scenario 4 (Destructive Without Token)*: "Delete task #42" -> Tagged `ACTION`, routed to `tasks.delete`, central policy intercepts with `REQUIRE_CONFIRMATION`, unforgeable cryptographic token issued with preview and warning, execution boundary intercepts without calling handler, zero ledger mutation.
  5. *Scenario 5 (Destructive With Token)*: "Delete task #55" -> Valid confirmation token presented, policy allows execution, handler executed, ledger claims and records success, re-submitting consumed token is strictly `BLOCKED` (replay attack prevented).
  6. *Scenario 6 (Ambiguous Destructive Request)*: "Delete that task" -> Ambiguity detector flags `AMBIGUOUS_TARGET` with `needsClarification: true`, policy returns `REQUIRE_CLARIFICATION`, zero confirmation tokens generated, execution boundary blocks before calling handler.
  7. *Scenario 7 (Multi-Step Goal Prompt)*: "Search my emails for flight confirmation and then append the itinerary to my Obsidian vault notes" -> Tagged `QUEST`, router exposes `google` and `obsidian` domains, quest engine creates persistent quest and DAG steps in SQLite, executed sequentially through operation ledger with dependency validation, quest auto-completes to `SUCCEEDED` in SQLite.
  8. *Recovery 1 (Orphaned Ledger Operations on Boot)*: External mutation recovered from `RUNNING` to `UNKNOWN_COMMIT`; local mutation recovered to `FAILED_RETRYABLE`; replay of unconfirmed external mutation is blocked.
  9. *Recovery 2 (Orphaned Quests on Boot)*: Orphaned `RUNNING` quest transitioned to `SUSPENDED` with crash note; orphaned `RUNNING` steps transitioned to `PENDING` with `CRASH_RECOVERED` error code; quest cleanly resumes on supervisor instruction.
- **Files Created / Updated**:
  - `lib/jarvis-core/capabilities/index.ts` (barrel export for capabilities)
  - `lib/jarvis-core/routing/strategy-e.ts` (refined word boundary detection for PR and repo signals)
  - `tests/jarvis-core/integration-c4-c8.test.ts` (full 9-test integration test harness)
- **Verification Evidence**:
  - `vitest run tests/jarvis-core/integration-c4-c8.test.ts`: 9/9 passed (100% green)
  - `vitest run tests/jarvis-core/`: 9 test suites, 163/163 passed (100% green)
  - `tsc --noEmit`: 0 errors
  - `pnpm build`: Clean production build (Next.js Turbopack) with 28 dynamic API routes.

