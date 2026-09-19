# Jarvis Core V2 Checkpoint Log

Authoritative chronological ledger of validated checkpoints for Jarvis Core V2.

---

## C0 — Repository Truth & Baseline Reconciliation

- **Date**: 2026-09-19
- **Branch**: `jarvis-core-v2`
- **Start HEAD**: `cf8dda2`
- **End HEAD**: `79b53bb`
- **Status**: PASS

### Changes
- Reconciled Next.js version to **16.2.6** (React 19.2.4) and canonical package manager to **`pnpm`** (v9.0 lockfile, workspace security overrides).
- Reconciled 60-scenario orchestration benchmark numbers:
  - Architecture A (Baseline ToolLoopAgent): 31.67% full completion, 53.33% premature termination, 21.67% hallucinated success.
  - Architecture B (Loop + Verifier): 96.67% full completion, 33,694 tokens/turn ($5.37/1k turns).
  - Architecture C (DAG Planner-Executor): 88.33% overall, 100.0% on executable tasks, 0.00% premature termination, 0.00% hallucinations, 3,187 tokens/turn (-86.2%), 660ms p50 latency.
- Reconciled capability counts: 47 registered tools across 12 groups, 4 unexposed candidate functions in `lib/skills.ts`, background functions, and disabled connectors.
- Initialized canonical governance files: `tasks/ACTIVE_PLAN.md`, `tasks/DECISIONS.md` (ADRs 001–005), `tasks/KNOWN_ISSUES.md` (ISSUE-001 through ISSUE-006), and `JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md`.

### Verification
- `pnpm typecheck`: PASS (0 errors)
- `pnpm test`: PASS (6 test files, 35 tests)
- `pnpm build`: PASS (Turbopack, TypeScript, 28 dynamic routes)

### Review
- Verified that V1 runtime in `lib/` is completely untouched.
- Clean working tree, zero uncommitted secrets.

### Commit & Push
- **Commit**: `79b53bb` (*"docs(c0): complete Checkpoint C0 repository truth and baseline reconciliation"*)
- **Push**: `origin/jarvis-core-v2` (verified: YES)

---

## C1 — Foundation Domain Types & Runtime Contracts

- **Date**: 2026-09-19
- **Branch**: `jarvis-core-v2`
- **Start HEAD**: `79b53bb`
- **End HEAD**: `8b0ca8e` (and amendment commit)
- **Status**: PASS

### Changes
- Created `lib/jarvis-core/types.ts` establishing shared vocabulary:
  - Strong branded string IDs (`TraceId`, `TurnId`, `QuestId`, `PlanId`, `PlanStepId`, `CapabilityId`, `ToolCallId`, `OperationId`).
  - Minimal JSON-safe primitives (`JsonPrimitive`, `JsonValue`, `JsonObject`).
  - Execution modes (`CHAT`, `READ`, `ACTION`, `QUEST`) representing resolved execution paths.
  - Ambiguity modeled explicitly via `ClassificationOutcome` (`resolved` vs `needsClarification`) rather than an execution mode.
  - Branched `TurnStatus` lifecycle supporting fast paths (`CHAT`, `READ`, `ACTION`) and graph path (`QUEST`).
  - `QuestStatus` lifecycle and entity contract designed for SQLite persistence (C8).
  - `Plan` and `PlanStep` contracts with operational failure isolation (`FAILED_RETRYABLE`, `FAILED_FINAL`, `UNKNOWN_COMMIT`, `BLOCKED_WITH_REASON`).
  - Shared `ActionClass`, `ConfirmationState`, `OperationStatus`, and `IdempotencyClass` vocabularies.
  - `CapabilityAvailability` states and `ProviderRole` definitions (Executor explicitly excluded).
  - Minimal component interfaces (`IntentClassifier`, `CapabilityRouter`, `Planner`, `PlanValidator`, `QuestExecutor`, `CompletionVerifier`, `Finalizer`).
  - Transport-independent `TurnController` boundary.
- Created `tests/jarvis-core/types.test.ts` (14 unit tests covering identities, execution modes, lifecycles, JSON serialization, and framework independence).

### Verification
- `pnpm typecheck`: PASS (0 errors)
- `vitest run tests/jarvis-core/types.test.ts`: PASS (14 tests in 11ms)
- `pnpm test` (full suite): PASS (7 test files, 48 tests)
- `pnpm build` (production build): PASS (Next.js 16.2.6 Turbopack in 34.5s, TypeScript in 28.4s, 28 dynamic API routes)

### Review
- Zero framework imports in `lib/jarvis-core/types.ts` (no React, NextRequest, NextResponse, ToolLoopAgent, or AI SDK stream types).
- Zero premature implementation of C2 (registries), C3 (ToolResult wrappers), C4 (confirmation policies), or C5 (ledger tables).
- V1 runtime in `lib/` remains 100% untouched.

### Deferred
- Items D-001 through D-010 logged in `tasks/DEFERRED.md`.

### Commit & Push
- **Commit**: `8b0ca8e` (*"feat(core-v2): complete Checkpoint C1 domain types and runtime contracts"*) & `33c64ed` (*"docs(core-v2): tighten C1 invariants and checkpoint records"*)
- **Push**: `origin/jarvis-core-v2` (verified: YES)

### Next
- Checkpoint C2: Canonical Capability Registry & Classification (`lib/jarvis-core/capabilities/`) (COMPLETE).

---

## [2026-09-19] Checkpoint C2 — Canonical Capability Registry & Classification
- **Status**: COMPLETE
- **Corpus / Baseline**: 47 registered tools across 12 domains; 4 unexposed candidate skill functions in `lib/skills.ts`.

### Architecture & Implementation
- Created `lib/jarvis-core/capabilities/types.ts`: typed domain vocabulary (12 domains), metadata interfaces (`CapabilityConfirmationMetadata`, `CapabilityIdempotencyMetadata`, `CapabilityRequirements`, `CapabilityAvailabilityMetadata`, `CapabilityRoutingMetadata`), `CapabilityDefinition`, `UnregisteredCandidateInfo`, `RegistryValidationResult`. Zero framework/ToolLoopAgent coupling.
- Created `lib/jarvis-core/capabilities/definitions/`:
  - `local.ts`: 18 local capabilities (6 tasks, 4 memory, 3 skills, 1 feed, 3 wake words, 1 preferences).
  - `research.ts`: 2 research capabilities (webSearch, fetchPage).
  - `connectors.ts`: 27 connector capabilities (6 GitHub, 10 Google, 5 Apple, 2 Telegram, 4 Obsidian).
  - `unregistered.ts`: 4 formally classified candidates (`deploySkillToGithub` as NOT_READY/D-011, `deleteSkill` as INTERNAL_ENGINE/D-012, `proposeRefinement` as INTERNAL_ENGINE/D-013, `discoverSkillCandidates` as BACKGROUND/D-005).
  - `index.ts`: canonical aggregator for all 47 definitions.
- Created `lib/jarvis-core/capabilities/registry.ts`: `CapabilityRegistry` class and singleton `capabilityRegistry` with query methods, domain filtering, ActionClass filtering, integrity validation, `toAiSdkTool` adapter, and `getV1CompatibilityTools()` adapter.
- Created `lib/jarvis-core/capabilities/diagnostics.ts`: developer inspection utility reporting capability counts, domain distribution, read-only vs mutation counts, confirmation/idempotency breakdowns, and static auth requirements with zero secret leakage.
- Created `tests/jarvis-core/capabilities.test.ts`: 12 automated unit tests validating registry integrity, 47 unique capabilities, 12 domains, action classes, valid Zod schemas, executable handlers, network isolation, 1:1 V1 compatibility with `allTools`, candidate classifications, and framework decoupling.

### Verification
- `pnpm typecheck` (`tsc --noEmit`): PASS (0 errors)
- `vitest run tests/jarvis-core/capabilities.test.ts`: PASS (12 tests in 41ms)
- `pnpm test` (full suite): PASS (8 test files, 61 tests, 100% green pass in 26.07s)
- `pnpm build`: PASS (Next.js 16.2.6 Turbopack in 18.2s, TypeScript in 22.3s, 28 dynamic API routes)

### Review
- Zero network calls on import or enumeration.
- Zero coupling to `ToolLoopAgent` in core capability types.
- V1 runtime in `lib/` remains 100% functional and compatible.
- All 4 unexposed skill candidates formally classified with safety rationale and tracked in deferral register.

### Deferred
- Items D-011 (`deploySkillToGithub`), D-012 (`deleteSkill`), D-013 (`proposeRefinement`) logged in `tasks/DEFERRED.md`.

### Commit & Push
- **Commit**: `3713e40` (*"feat(core-v2): add canonical capability registry"*)
- **Push**: `origin/jarvis-core-v2` (pending remote sync)

### Next
- Checkpoint C3: Structured ToolResult Boundary (`lib/jarvis-core/capabilities/result-boundary.ts`).

