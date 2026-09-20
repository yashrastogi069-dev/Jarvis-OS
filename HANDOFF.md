# JARVIS — Handoff Document

Status as of **2026-09-21**. Authoritative state of the codebase following completion of **Checkpoints C0 through C13** and the **C9–C13 Cross-Checkpoint Integration Gate** of the **JARVIS CORE V2 MASTER PROTOCOL**.
- **Active Git Branch**: `jarvis-core-v2` (tracking `origin/jarvis-core-v2` on `https://github.com/yashrastogi069-dev/Jarvis-OS.git`)
- **Master Plan**: `tasks/ACTIVE_PLAN.md` (Checkpoints C0–C23)
- **Architectural Decisions**: `tasks/DECISIONS.md` (ADR-001 through ADR-008)
- **Known Issues Ledger**: `tasks/KNOWN_ISSUES.md` (ISSUE-001 through ISSUE-006)
- **Deferred Register**: `tasks/DEFERRED.md` (D-001 through D-015)
- **Living Implementation Report**: `JARVIS_CORE_V2_IMPLEMENTATION_REPORT.md`
- **Execution Log (C9–C13)**: `JARVIS_CORE_V2_MEGA_GOAL_C9_C13_LOG.md`
- **Execution Log (C4–C8)**: `JARVIS_CORE_V2_MEGA_GOAL_C4_C8_LOG.md`
- **Foundation Types**: `lib/jarvis-core/types.ts` & `tests/jarvis-core/types.test.ts` (15/15 tests green)
- **Capability Registry**: `lib/jarvis-core/capabilities/` & `tests/jarvis-core/capabilities.test.ts` (12/12 tests green)
- **Safe Execution Boundary**: `lib/jarvis-core/capabilities/safe-boundary.ts` & `tests/jarvis-core/result-boundary.test.ts` (39/39 tests green)
- **Central Action Safety Policy**: `lib/jarvis-core/safety/` & `tests/jarvis-core/safety-policy.test.ts` (25/25 tests green)
- **Persistent Operation Ledger**: `lib/jarvis-core/ledger/` & `tests/jarvis-core/operation-ledger.test.ts` (23/23 tests green)
- **Intent Analysis & Ambiguity System**: `lib/jarvis-core/intent/` & `tests/jarvis-core/intent-analysis.test.ts` (16/16 tests green)
- **Capability Router & Shadow Evaluation**: `lib/jarvis-core/routing/` & `tests/jarvis-core/capability-router.test.ts` (23/23 tests green)
- **Persisted Quest Engine**: `lib/jarvis-core/quest/` & `tests/jarvis-core/quest-engine.test.ts` (15/15 tests green)
- **Structured DAG Planner**: `lib/jarvis-core/planner/` & `tests/jarvis-core/planner.test.ts` (22/22 tests green)
- **Deterministic Plan Validator**: `lib/jarvis-core/planner/validator.ts` & `tests/jarvis-core/plan-validator.test.ts` (20/20 tests green)
- **Deterministic DAG Executor**: `lib/jarvis-core/executor/` & `tests/jarvis-core/executor.test.ts` (10/10 tests green)
- **Terminal Completion Verifier**: `lib/jarvis-core/verifier/` & `tests/jarvis-core/verifier.test.ts` (5/5 tests green)
- **Controlled Replanner**: `lib/jarvis-core/planner/replanner.ts` & `tests/jarvis-core/replanner.test.ts` (9/9 tests green)
- **Cross-Checkpoint Integration Gate (C9–C13)**: `tests/jarvis-core/integration-c9-c13.test.ts` (20/20 tests green)
- **Total Suite Health**: 15 test files, 263/263 passed (100% green); `pnpm typecheck` 0 errors; `pnpm build` clean.
- **Standing Rules**: `CLAUDE.md` and `tasks/lessons.md`.

---

## NEXT AGENT START HERE

> [!IMPORTANT]
> **MEGA GOAL C9 → C13 & INTEGRATION GATE ARE COMPLETE & COMMITTED.**
> The deterministic planning, validation, execution, verification, and controlled replanning stack is fully functional, tested, and pushed.
> **DO NOT BEGIN C14 AUTOMATICALLY.**
> **DO NOT CUT OVER PRODUCTION `/api/chat`.**
> **DO NOT MERGE TO `main`.**
> Await explicit user authorization for Phase 3 (C14 Integration / Cutover Gate).
>
> Baseline verification before doing anything:
> 1. Verify working branch is `jarvis-core-v2` (`git status -sb`).
> 2. Run test verification (`pnpm vitest run tests/jarvis-core/`) to confirm baseline 263/263 tests pass.
> 3. Run typecheck (`pnpm typecheck`) and production build (`pnpm build`).

---

**Active Protocol**: Building **Jarvis Core V2** beside V1 in `lib/jarvis-core/`. V1 remains 100% untouched and functional. Checkpoints **C0 through C13 and both Cross-Checkpoint Integration Gates are COMPLETE**. All planning, validation, execution, and verification engines are verified in place. Next checkpoint on the roadmap is **C14: Production Integration Gate**.


---

## 1. What's fully built and working

### Foundation (Phase 0)
- Env provisioned (`.env.local`, gitignored): Gemini, Groq, OpenRouter,
  NVIDIA, Tavily, Serper, Firecrawl keys live. `GITHUB_TOKEN` intentionally
  empty (add a classic PAT to enable the GitHub connector).
- `package.json` cleaned (renamed `jarvis`, dead fields removed,
  `@vercel/analytics` removed — this is a local-first OS, not hosted).
- `next.config.mjs`: `ignoreBuildErrors` removed (typecheck is genuinely
  clean), `turbopack.root` set.
- `pnpm-workspace.yaml`: `hono@4.12.25` override restored (CVE pin for
  `mcp-handler`), `onlyBuiltDependencies` correct.
- Ollama installed (0.31.1) and running locally with `nomic-embed-text`
  pulled.

### Brain rewire (Phase 1)
- **`lib/providers.ts`** — failsafe chain: **Gemini 2.5 Flash → Groq Llama
  3.3 70B → OpenRouter free rotation → NVIDIA NIM → Ollama local**.
  Per-provider cooldowns on 429/5xx, `FORCE_DISABLE_PROVIDERS` test hook,
  live status surfaced via `/api/health` and the status bar (`brain: <id>`).
  Verified live: chat streams from Gemini, memory-save tool call round-trips
  end-to-end, `webSearch` (Tavily→Serper) returns live results, failover to
  Groq confirmed when Gemini is disabled.
- **`lib/research.ts`** — `webSearch` + `fetchPage` (Firecrawl) added to the
  agent's toolset, graceful degradation on failure.
- Data correctness fixes: all timestamps unified to milliseconds
  (`scripts/normalize-timestamps.mjs`, idempotent, backs up the DB first);
  the `lib/skills.ts` analyzed-flag update bug (missing `.where()`, was
  marking unrelated rows) fixed.
- `app/api/chat` hardened: zod validation, 50-message history cap, honest
  error responses instead of unhandled 500s.

### Design system (Phase 2)
- `app/globals.css` rewritten to the **Arc Reactor OKLCH palette**:
  near-black `#07090C`-family base, ice-cyan `#38E1FF` primary, hot-gold
  accent, a `--accent-live` CSS variable contract that Phase 3's theme
  engine now drives in real time (`--ring`, `.glow-primary`, `.text-glow`
  all derive from it).
- Space Grotesk added as the display font (`next/font/google`), Geist Mono
  kept for data/HUD readouts.
- Motion token layer (`--ease-out-expo`, `--ease-out-quint`, duration
  scale) with mandatory `prefers-reduced-motion` overrides on every
  keyframe utility.
- Contrast-verified (`scripts/verify-contrast.mjs`).

### Existing connectors (pre-dated this build, confirmed present and honest)
GitHub (PAT), Obsidian (Local REST API, vault indexing + browsing), Telegram
(bot long-poll), Google (OAuth + Gmail/Calendar, read-only), Apple (iCloud
CalDAV). All feed into the unified events feed with real
"DISCONNECTED · SEED DATA" fallback badges when not configured — no fake
data pretending to be live. **Not yet deep-audited or extended in this
build** — that's Phase 5.

### Skill Factory (pre-dated this build, confirmed present)
Create/run/rate/refine skills, versioned refinement loop, SKILL.md export,
GitHub deploy-to-repo. Usage-observation loop (`agent_runs` table,
`/api/skills/discover`) already exists for auto-suggesting skills from
behavior. **Not yet used for the big "mine 93 Claude session transcripts"
task** — that's Phase 8, hasn't started.

---

## 2. Phase 3 — "The Stage": in progress, THIS is the current focus

The big visual transformation: killing the old boxed 3-column grid entirely
and replacing it with a full-viewport 3D scene (space environment, an
interactive Arc Reactor, a color-driving neural network) with the
functional UI floating over it as open glass HUD panels — no dividing
lines. Full design spec: **`tasks/PHASE3_DESIGN.md`** (Fable-authored,
Yash-approved, read it before touching scene/HUD code).

Built as 4 sequential chunks, each independently gated (typecheck, build,
live verification) and committed:

| Chunk | Status | What it is |
|---|---|---|
| **A — Theme engine** | ✅ DONE, committed (`944aa1e`), pushed | `lib/theme-engine.ts` (zustand store), `components/theme-engine-provider.tsx` (rAF drift/snap loop), `--accent-live` writer. Live-verified: idle hue drifts continuously, snaps to state color on a real chat turn, freezes correctly under reduced-motion emulation. |
| **B — Stage + HUD restructure** | ✅ DONE, committed (`97e15af`, `4958ce4`), pushed | `components/scene/jarvis-stage.tsx` (WebGL Canvas, space environment, placeholder reactor), `environment.tsx` (starfield/grid/dust), `poster.tsx` (no-WebGL/mobile CSS fallback), `components/hud/*` (hud-shell, edge-rail, panel-overlay, core-readout — the open glass layout), `app/page.tsx` fully rewritten, old `core-stage.tsx`/`neural-core.tsx` deleted. Live-verified via Playwright: full-bleed space environment, glass chat dock, edge rail with all 5 panel icons, `<1024px` responsive fallback, zero console errors, zero boxed borders. Functional gates passed but failed on taste (see below) — **now resolved, see "Chunk B visual redesign" below.** |
| **B redesign — futuristic color pass** | ✅ DONE, committed (`65e1557`), pushed | Fixed the "monochrome/boring/dated" verdict. See full writeup below. |
| **C — Arc Reactor** | ✅ DONE, committed, pushed | Ring-assembly reactor with click/hover-to-talk mic wiring, camera lookAt centered on the reactor. |
| **D — Neural network + choreography + perf** | ✅ SHIPPED, committed `12e7d0f`, pushed | Full rewrite of `components/scene/neural-network.tsx`: `THREE.Points` custom shader lattice (384 nodes: 320 shell + 64 interior, lumpy fibonacci sphere + 3 more morph configs — spiral disc, torus ring, rippled sheet), true perspective z-depth point sizing, crisp disc+halo fragment shader, radar sweep (azimuth vs rotating angle, Gaussian lobe), random-order auto shape morphing (5.5s morph + 0.55s hold), auto edge join/disjoin (timer-driven random batch retire/relight, per-vertex line colors), idle OKLCH hue walk with state-accent snap override, per-frame arc-line rebuild following the morph. Network group repositioned onto the camera→reactor sight line, full-screen coverage. Hub-click panel-shortcut functionality was built, verified, then **removed at Yash's explicit request** — plain `<points>` element remains, no interactivity. Extensive live art-direction loop with Yash (10+ rounds) before this landed; see git log on `jarvis-build` for the blow-by-blow. |

**Phase 3 is fully complete.** The hold-point ("stop after B+C+D, wait for approval") was cleared — Yash reviewed live and said to continue to Phase 4.

### Chunk B visual redesign — RESOLVED (2026-07-11)

Yash's direct feedback after seeing Chunk B live: *"the hub has one colour
only, it does not look futuristic/modern, the theme is very boring and
old."* Chunk B was functionally correct but failed on taste (see
`lessons.md` item 11a).

**Process followed:**
1. Started dev server, captured real baseline screenshots (idle stage +
   feed panel open) at 1536px via Playwright.
2. Ran a genuine Fable review (model `fable`, high effort) of those
   screenshots plus the actual source files (globals.css, all HUD
   components, scene/environment code), invoking impeccable/ui-ux-pro-max/
   emilkowal-animations/taste design-skill judgment. Fable's measured
   verdict: the screen was "black, gray, and one cyan" — `.hud-glass` at
   chroma 0.01 was imperceptibly gray, the grid was at 7% alpha (invisible),
   dust at 9% (invisible), the placeholder reactor was a flat unshaded
   decagon (the single strongest "dated" signal), and there was zero
   environmental depth or typography hierarchy.
3. Fable returned 12 exact, ordered fixes (colors, gradients, opacities,
   specific file/selector targets) — all applied:
   - `.hud-glass` rebuilt as real gradient glass (cyan-to-indigo tint,
     `saturate(140%)`, specular top inset, tinted hairline border, drop
     shadow) + new `.hud-glass-accent-edge` light-catch utility.
   - New `.hud-atmosphere` violet/cyan radial-gradient depth layer behind
     the transparent Canvas; `--background` regraded to
     `oklch(0.13 0.018 255)`; vignette/scrim recolored to match.
   - Starfield given per-vertex stellar temperature variance (68% ice
     white / 18% warm / 14% violet-white) instead of one flat color; grid
     shader opacity 0.07→0.14 plus a brighter major-line-every-4th pass;
     dust motes 64→96 count, opacity 0.09→0.16.
   - Placeholder reactor (Chunk C will replace it) dressed with a smooth
     detail-4 core, an additive halo sprite, and one dark-metal torus
     ring tilted 12° — kills the flat-decagon look until the real
     assembly ships.
   - Gold micro-accents (wordmark `/`, readout `//` separator) at under 1%
     screen coverage — one accent still owns the screen per taste
     guardrails.
   - Chat dock: input capsule with focus glow, filled live-accent SEND
     button, tinted MIC/quick-action chips, borderless message bubbles.
   - Status bar: glowing health dots, display-font wordmark, ghost
     settings button. Edge rail: accent-tinted hover/active states. Panel
     overlay: new slide-in-from-right entrance + two-tone headers. Feed
     rows: borderless with hairline separators (removed the boxed-card
     look that was recreating Phase 3's banned dividing-line pattern).
4. **Bug found and fixed during this pass** (not in Fable's original list,
   caught live by Yash): the two new `::before`/`::after`-based edge-glow
   utilities (`hud-glass-accent-edge`, `hud-edge-fade`) declared
   `position: relative` on their own class, which — same CSS specificity,
   later in the stylesheet — silently overrode Tailwind's `fixed`/
   `absolute` utility classes already on their host elements (the chat
   dock, the overlay panel). Effect: summoned panels (Feed/Notes/Memory/
   Skills/Settings) rendered bottom-left and clipped instead of the
   intended right-side slide-in. Fix: removed the `position` declaration
   from both utilities (their hosts already establish positioning
   context); verified live that all 5 panels now open correctly on the
   right.
5. Gates: `pnpm typecheck` 0 errors, `pnpm build` succeeded, before/after
   screenshots captured and compared.

**Files touched:** `app/globals.css`, `app/page.tsx`,
`components/scene/jarvis-stage.tsx`, `components/scene/environment.tsx`,
`components/hud/core-readout.tsx`, `components/hud/panel-overlay.tsx`,
`components/hud/edge-rail.tsx`, `components/hud/hud-shell.tsx`,
`components/status-bar.tsx`, `components/chat-panel.tsx`,
`components/feed-panel.tsx`. Commit `65e1557`, pushed to
`origin/jarvis-build`.

**Outstanding:** a final Fable *confirmation* pass (reviewing the
after-screenshots against the original verdict, plus flagging any residual
nits for Chunk C's brief) was requested but failed mid-run —
`Agent terminated early due to an API error: You've hit your session limit
· resets 9:20am (Asia/Calcutta)`. Re-run this confirmation pass once the
session limit resets, before or alongside starting Chunk C — it's a cheap
sanity check, not a blocker, since the fixes already match Fable's own
prior written brief and gates are green. Screenshots for that pass are
saved at `C:\Users\win 10\Desktop\praxis\chunkB-redesign-idle.png` and
`chunkB-redesign-panel-open.png`.

### Yash's standing instructions for the rest of Phase 3

- **Use Fable more actively on Chunks C and D** — not just as an emergency
  contact for design ambiguities, but a real pre-flight design-refinement
  pass before each chunk's executor builds, and a real advisory screenshot
  review after each chunk completes.
- **Hold point:** once the B redesign + Chunks C and D are all done,
  **stop and wait for Yash's explicit approval** before starting Phase 4 or
  anything further. Do not auto-advance past this checkpoint.

---

## 3. Phase 4 — Shell & panels redesign: DONE ON DISK, NOT YET COMMITTED

Full forward plan for Phases 4-9 (reconciled across 4 Fable planning
subagents) lives in **`tasks/MASTER_PLAN_V2.md`** — read that for chunk
breakdowns, cross-cutting decisions, and the Phase 6/7 flagship spec
(voice pipeline + intelligence organs, adopting the already-built
WhisperFlow clone at `Desktop/Whisper clone`). This section is just the
Phase 4 status snapshot.

- **4A — Phosphor icon migration**: ✅ DONE, committed (`e328cfe`), pushed.
  `edge-rail.tsx`, `hud-shell.tsx`, `panel-overlay.tsx`, `status-bar.tsx`
  fully off lucide-react, onto `@phosphor-icons/react` (thin/duotone).
- **4B — panel-kit primitives + status bar/readout honesty**: ✅ DONE,
  **staged on disk, not committed**. `components/hud/panel-kit.tsx`
  created (new file). `status-bar.tsx` rewritten with data-driven
  `DOT_DESCRIPTORS` (db/ollama/obsidian/github/telegram/google/apple/
  voice/mcp) + `AggregateDot` collapse below `lg`. `core-readout.tsx` and
  `edge-rail.tsx` also modified (brain-indicator fix, index-derived
  hotkeys). `app/globals.css` gained the `--ease-hud` token +
  `enter-rise` keyframe.
- **4C — restyle all 5 panels onto panel-kit**: ✅ DONE, **staged on
  disk, not committed**. `feed-panel.tsx`, `memory-panel.tsx`,
  `notes-panel.tsx`, `settings-panel.tsx`, `skills-panel.tsx` all
  modified.
- **4D — batched verify + Fable taste review + ship**: ⏳ NOT DONE. This
  is the remaining gap: run gates (`pnpm typecheck`, `pnpm build`),
  live-verify all 5 panels + 9 dots + aggregate dot on :3100, get a Fable
  taste pass on the restyled panels, update `JARVIS_BUILD_STATE.md` to
  Phase 4 SHIPPED, commit (excluding the stray 1-line `tasks/PLAN.md`
  diff — leave that file alone), push to `jarvis-build`.

Executed fast via a Sonnet subagent per Yash's instruction ("this phase
isn't that important, do it fast"); the agent was cut off by the weekly
usage limit right before committing. Its work survived — `git status` in
the repo shows the full staged diff. Next session: verify, gate, commit,
push, then move straight to Phase 5.

## 4. What's next after Phase 4 (per `tasks/MASTER_PLAN_V2.md`)

- **Phase 5 (SCOPED SLICE) — CLOSED 2026-07-17.** Built: `lib/connectors/
  registry.ts` ({id, probe(), sync(), tools, promptHint} for all 5
  connectors + voice/system), `lib/connectors/oauth.ts` (generic OAuth
  module, PKCE-ready), the real CSRF fix (missing `state` param — was a
  genuine live vulnerability, now fixed and live-verified), refresh-token
  rotation fix. `lib/agent.ts`, health, feed, status-bar all migrated onto
  the registry. Canva and the local-system/filesystem connector were
  explicitly deferred by Yash to a later, separate pass — not done here.
  Deeper Obsidian integration (daily-note append, auto-index) also
  deferred. Full detail: `JARVIS_BUILD_STATE.md`.
- **Phase 6 (flagship)** — Voice + intelligence organs: **CLOSED 2026-07-17**.
  Chunks A-E + H (wake-word) + I (connector write-capability) all shipped
  and live-verified; two brain-breaking bugs (system-message crash, voice
  flooding chat) found via Yash's live testing and fixed same-day. Chunks F
  (latency instrumentation, tone-prefs UI) and G (formal verification
  matrix, Fable taste pass) explicitly deferred to a polish backlog, not
  blocking. Full detail: `JARVIS_BUILD_STATE.md` Phase 6 section. Target
  latency p50 ≤1.8s (not yet instrumented); full spec
  `tasks/MASTER_PLAN_V2.md` §5.
- **Phase 7 (flagship)** — Adopt the already-built WhisperFlow clone
  (`Desktop/Whisper clone`) into `tools/dictate`, wire `app/api/system/*`
  with a system token, F9 ask-anywhere, proactive triggers + guardrails +
  ntfy push.
- **Phase 8** — Skill mining: fan out subagents across ~101 Claude Code
  session transcripts on this machine (~124MB, privacy-guarded extraction —
  never copy secrets/tokens verbatim, 4-layer redaction), synthesize into
  ranked skill proposals, get Yash's sign-off, create the approved ones in
  the Skill Factory.
- **Phase 9** — Harden & ship: `SHIP_GATE.md`, git-history secrets scan,
  prod smoke test, MCP e2e, full regression pass, rewrite this document and
  the README to match final reality, draft PR `jarvis-build → main`.

---

## 5. Known environment gotchas (don't rediscover these)

- **pnpm** is at `C:\Users\win 10\AppData\Roaming\npm\pnpm`, not
  necessarily on PATH in every shell — use the full path or prepend it.
- **Turbopack cache corruption**: repeatedly force-killing a dev server
  mid-compile can corrupt `.next`, causing every subsequent compile of `/`
  to hang indefinitely (not just slow). If a compile hangs past ~2 minutes
  with no progress in the log, delete `.next` and retry before assuming a
  code bug — this already happened once and wasted real debugging time.
- **First compile of `/` is genuinely slow** (8s+ cold) because it's the
  heaviest route (three.js/@react-three/fiber). This is normal, not a bug.
- **Dev server runs on port 3100**, not the Next.js default 3000, to avoid
  clashing with other local projects.
- **Windows paths with spaces** (`win 10`): always use `spawn` without
  `shell:true` in any code that shells out (voice binaries especially).
- **Workflow `agent()` calls default to inheriting the session's current
  model** — if you toggle `/model` mid-session, already-queued-but-not-yet-run
  Workflow chunks can silently pick up the wrong model. Always pin
  `model: 'opus'` explicitly for anything under the "no compromise" rule.

---

## 6. File map (current, not the stale original)

Key files added/changed by this build beyond the original v0 export:

```
CLAUDE.md                          session bootstrap + standing rules
HANDOFF.md                         this file
JARVIS_BUILD_STATE.md              cross-session resume contract (phase/chunk status)
tasks/MASTER_PLAN_V2.md            authoritative Phase 4-9 plan (reconciled, replaces PLAN.md forward sections)
tasks/PLAN.md                      original master build plan (superseded going forward by MASTER_PLAN_V2.md)
tasks/PHASE3_DESIGN.md             Fable's Phase 3 visual/technical spec
tasks/lessons.md                   self-improvement log (every Yash correction)

lib/providers.ts                   brain failsafe chain
lib/research.ts                    webSearch / fetchPage agent tools
lib/theme-engine.ts                zustand store driving the live OS accent color
scripts/normalize-timestamps.mjs   one-time DB timestamp migration
scripts/verify-contrast.mjs        Phase 2 contrast audit

components/theme-engine-provider.tsx
components/scene/jarvis-stage.tsx  the single WebGL canvas (env + reactor + network)
components/scene/environment.tsx   starfield / grid floor / dust
components/scene/poster.tsx        no-WebGL / mobile CSS fallback
components/scene/arc-reactor.tsx   Chunk C reactor (DONE)
components/scene/neural-network.tsx Chunk D lattice (DONE, shipped 12e7d0f)
components/hud/hud-shell.tsx       layout orchestrator (chat dock, hotkeys)
components/hud/edge-rail.tsx       5-icon panel-summon rail
components/hud/panel-overlay.tsx   summonable glass panel
components/hud/core-readout.tsx    bottom state/health caption
components/hud/panel-kit.tsx       Phase 4B shared panel primitives (staged, uncommitted)

components/core-stage.tsx          DELETED (superseded by scene/*)
components/neural-core.tsx         DELETED (superseded by scene/*)
```

Everything else (API routes, connectors, memory engine, skill factory,
MCP server) is the pre-existing build, functionally intact and not yet
touched by the redesign except where noted above.
