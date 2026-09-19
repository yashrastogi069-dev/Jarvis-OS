# JARVIS — Master Implementation Plan (v1)

Planner: Fable 5 (high effort) · Reviewer: Yash · Executors: Opus/Sonnet (xhigh)
Branch: `jarvis-build` · Status: AWAITING YASH APPROVAL
Nothing below executes until approved. After each phase the executor reports
back to Fable for advisory review, updates JARVIS_BUILD_STATE.md, commits and
pushes.

## 0. Status delta vs HANDOFF.md (ground truth, verified by reading code)

- HANDOFF.md is stale. Telegram (`lib/connectors/telegram.ts`), Google OAuth +
  Gmail/Calendar (`lib/connectors/google.ts`, `app/api/google/*`), and Apple
  iCloud CalDAV (`lib/connectors/apple.ts`) connectors ALREADY EXIST, plus a
  usage-observation loop (`agent_runs`, `app/api/skills/discover`).
- Actually broken today: NO `.env.local` (only `.env.example`), Ollama not
  installed, no `data/` / `bin/` / `models/` dirs. Chat, memory embeddings,
  GitHub connector, and voice are all non-functional right now.
- `tsc --noEmit` passes clean today (so `ignoreBuildErrors` can be removed).

## 1. Bug / debt fix list

### P0 — functional breakage
1. `lib/agent.ts:20-33` — brain = Groq (no key) → Ollama (not installed).
   Chat is 100% dead. Fixed by Phase 1 provider chain.
2. No `.env.local`. `GITHUB_TOKEN` unset → GitHub tools
   (`lib/connectors/github.ts:14`) and skill deploy (`lib/skills.ts:317`)
   throw. Phase 0 provisions env from keys file (values never printed or
   committed).
3. Voice broken-by-construction on Windows:
   - `lib/voice/paths.ts:12,17` — no `.exe` suffix on win32.
   - `scripts/setup-voice.sh:40-45` — no Windows case for Piper (hard exit 1);
     needs `scripts/setup-voice.ps1` using prebuilt whisper.cpp Windows
     release + `piper_windows_amd64.zip`.
   - `app/api/voice/speak/route.ts:30-33` — `--output_file -` (stdout WAV)
     must be verified on Windows Piper; temp-file fallback. Paths contain a
     space (`win 10`) — keep `spawn` without `shell:true` everywhere.

### P1 — correctness / security debt
4. Dual timestamp epochs in one DB: raw SQL writes ms (`lib/events.ts:36`,
   `lib/memory.ts:106`, `lib/settings.ts:35`) while Drizzle
   `mode:"timestamp"` tables write seconds (`lib/db/schema.ts:12,27,57,75,89`).
   Cross-path reads render 1970 dates. Standardize on timestamp_ms with an
   idempotent one-time normalization script (DB backup first).
5. `lib/skills.ts:271` — `db.update(agentRuns).set({ analyzed: 1 })` has NO
   `.where()`: marks unanalyzed runs outside the 200-window. Scope to the
   selected ids.
6. `app/api/google/callback/route.ts` — no OAuth `state` param (CSRF); errors
   swallowed silently. Add random state persisted in connector_settings + log.
7. `app/api/settings/route.ts:24` — GET returns full MCP bearer key
   unauthenticated. Return masked; reveal only on explicit regenerate/copy.
8. `app/api/chat/route.ts:8` — no body validation/try-catch; malformed JSON →
   unhandled 500. No message-history cap.
9. pnpm-workspace migration dropped the `hono: 4.12.25` override (likely CVE
   pin for mcp-handler). Restore under pnpm-workspace.yaml; delete dead
   `pnpm` field from package.json.

### P2 — hygiene
10. `next.config.mjs` — remove `ignoreBuildErrors` (typecheck passes today);
    add `"typecheck": "tsc --noEmit"` script; add `turbopack.root`.
11. package.json name `my-project` → `jarvis`; remove `@vercel/analytics`
    (local-first OS) and runtime `shadcn` CLI dep.
12. `components/status-bar.tsx:7-20` — HealthData omits telegram/google/apple
    fields `/api/health` already returns; no dots for new connectors.
13. `components/neural-core.tsx` — hardcoded hex colors disconnected from
    theme; no prefers-reduced-motion; Canvas renders when tab hidden.
    Superseded by Phase 3 rewrite.
14. Add `next-env.d.ts` to .gitignore; commit workspace/lockfile fixes.
15. HANDOFF.md drift — rewrite at ship time (Phase 9).

## 2. Architecture decisions

### 2.1 Brain: provider failsafe chain (new lib/providers.ts)
Gemini 2.5 Flash (@ai-sdk/google) → OpenRouter free models
(@openrouter/ai-sdk-provider; openai-compatible fallback if v7 peer friction)
→ NVIDIA NIM (openai-compatible, integrate.api.nvidia.com/v1) → Ollama local.
Ordered by free-tier tool-calling reliability. `resolveModel()` returns first
healthy provider with per-provider cooldowns on 429/5xx; mid-stream failover
before first token; live "brain: X" indicator in status bar. Embeddings stay
Ollama nomic-embed-text (768-dim vec_memories locks this) — Ollama install is
a Phase 0 gate; keyword fallback already covers absence. Research tools:
webSearch (Tavily → Serper), fetchPage (Firecrawl) join the agent toolset.

### 2.2 Theme engine: neural core drives the OS
Tiny zustand store `{ coreState, hue, energy }`. One rAF loop: slow ambient
hue drift through the Arc Reactor palette when idle, eased snap (<300ms) to
state colors (listening/thinking/speaking). Writes `--accent-live` (+ derived
glow) onto documentElement at max 10Hz; globals.css re-bases --primary,
--ring, glow utilities on it. R3F scene reads the store directly per-frame.
Reduced motion: freeze drift, instant snaps.

### 2.3 Neural core + Arc Reactor (BOTH, distinct) — REVISED 2026-07-10
Yash direction after Phase 2 review (creative freedom granted, bar =
"astonishing"): BREAK the boxed 3-column layout and its dividing lines.
Free, open composition — a full-viewport 3D animated stage as the OS
background, with the neural network and a prominent, clearly visible Arc
Reactor living IN it, and the functional panels (chat, feed, skills, etc.)
floating over it as an open HUD rather than boxed columns.
- 3D animated background for the Arc Reactor + neural network (single WebGL
  canvas for everything 3D; no second context).
- Neural core: theme-token colors, energy pulses along edges (pulse pool
  capped), hover raycast highlight, frameloop pause when hidden,
  reduced-motion static render, dpr cap 1.5.
- Arc Reactor: prominent, unobstructed, interactive — the VOICE ENTRY POINT
  (click/hotkey to talk; reacts to mic level and playback amplitude; idle
  breathing). May be rendered in the same 3D scene (revising the earlier
  2D-SVG decision) if Fable's design says so.
- Fable authors the visual/technical design spec (composition, scene graph,
  animation choreography, interaction model, perf budget) BEFORE the Phase 3
  executor implements: see tasks/PHASE3_DESIGN.md.

### 2.4 Connector framework + local-system connector
Registry refactor: each connector exports { id, probe(), sync(), tools };
health/feed/status-dots iterate it. New lib/connectors/local.ts: chokidar
watch on chosen folders → file events into feed (debounced, ignore globs,
rate-capped); clipboard/active-window via Phase 7 companion POSTing to
/api/system/observe. Obsidian depth: daily-note append tool, backlink-aware
search, auto-index on vault change.

### 2.5 Voice (two modes)
In-OS Jarvis (Phase 6): mic → STT → brain → TTS → speaker is CORRECT; build
the streaming version — browser VAD (energy first, Silero-ONNX optional) for
end-of-speech; whisper.cpp (base.en if latency allows); stream agent tokens;
sentence-boundary chunker → per-sentence /api/voice/speak → queued playback
(~1s to first audio); barge-in pauses playback on VAD activity.
TTS: Piper (Windows release) default; Kokoro-82M (kokoro-js) behind settings
toggle if <400ms/sentence locally; Edge-TTS rejected (unofficial cloud API,
breaks local-first).
Global dictation (Phase 7): tools/dictate/ Python utility (uv): global hotkey
→ sounddevice record → whisper-cli → optional LLM cleanup → SendInput
(keyboard.write), pystray tray icon.

### 2.6 Skill mining pipeline (Phase 8)
93 transcripts, 18 project dirs. Fan out 6-7 parallel Sonnet subagents
(~15 transcripts each) extracting ONLY task patterns to structured JSON —
explicit prohibition on copying keys/tokens/personal data/file contents.
One Opus synthesis pass → ranked ~10-15 skill proposals →
tasks/skill-mining-report.md → Yash approves shortlist → approved skills
created via POST /api/skills + SKILL.md exports.

### 2.7 UI system
Icons: keep lucide-react (Phosphor migration buys nothing functional).
Fonts: Space Grotesk display + Geist Mono data via next/font. Rules for every
phase: reduced-motion alternatives, ease-out expo/quint, entrances <300ms
staggered, focus-visible rings, tabular-nums metrics, sparse glow, no
glassmorphism-default / gradient text / side-stripes, 4.5:1 body contrast.

## 3. Phases (executor · gate)

### Phase 0 — Foundation & hygiene (Sonnet xhigh)
Fix items 2, 9, 10, 11, 14; create JARVIS_BUILD_STATE.md; provision .env.local
from keys file (gitignored, never echoed); install Ollama + nomic-embed-text
(+ llama3.2:3b optional) or document blocker.
GATE: typecheck 0 with ignoreBuildErrors removed; pnpm build OK; /api/health
db.ok+vec true, ollama true; git clean; pushed.

### Phase 1 — Brain rewire + research chain (Opus xhigh)
lib/providers.ts chain; getChatModel() rewrite; settings brain picker +
provider status; harden /api/chat; fix skills.ts where-clause; timestamp
normalization (backup first); research tools; .env.example update.
GATE: streaming tool-calling chat ("remember X" → memory row); kill primary
key → visible failover; webSearch live; typecheck/build green.

### Phase 2 — Design system: Arc Reactor identity (Sonnet xhigh)
globals.css rewrite (near-black #07090C base, ice-cyan #38E1FF primary,
hot-gold #FFB020 accent, alert red, --accent-live plumbing); Space Grotesk;
motion utilities + reduced-motion layer; contrast audit documented.
GATE: before/after screenshots; contrast ≥4.5:1 body; no layout regressions
at 1280/1536/1920. Use design skills like ui-ux-pro-max, impeccable, taste skill,  
emilkowal-animations, frontend design skill etc where needed to create the best UI/UX

### Phase 3 — Neural core + Arc Reactor + theme engine (Opus xhigh/Fable High when needed)
Theme store/provider; neural-core rewrite (pulses, hover, drift+snap,
frameloop pause, reduced motion); components/arc-reactor.tsx (mic-level
reactive, click-to-talk wired to existing mic flow); center column hosts both.
GATE: screenshots + recording of drift and state snap; perf trace 60fps,
main thread <30% idle; accent follows core state during a chat turn;
reduced-motion verified.

### Phase 4 — Shell & panels redesign (Sonnet xhigh)
Status bar rebuild (registry-driven dots incl. telegram/google/apple/voice +
brain indicator); all panels restyled (stagger, tabular figures, focus
rings); DISCONNECTED badges preserved; MCP key masked.
GATE: per-panel screenshots; keyboard-only pass; honest offline states
demonstrated with services off.

### Phase 5 — Connector framework + Google/Telegram/local + Obsidian depth (Sonnet xhigh)
Registry refactor; Google OAuth state param + localhost setup doc; Telegram
live test; local fs-watch connector + settings UI; Obsidian daily-note append
+ auto-index; feed/health iterate registry.
GATE: per-connector live demo (Google items in feed post-OAuth, Telegram
round-trip, file-drop in feed <5s, Obsidian search/read/append); disconnect
each → honest gray dot + badge.

### Phase 6 — Voice: in-OS Jarvis assistant (Opus xhigh/Fable High when needed)
setup-voice.ps1 (pinned prebuilt URLs); paths.ts .exe handling; Windows Piper
stdout verification + temp-file fallback; VAD; sentence-chunk TTS queue +
barge-in; Kokoro eval behind toggle; Arc Reactor = live voice surface.
GATE: spoken question → first audio ≤~1s after end-of-speech (measured);
barge-in works; voice turn triggering a tool call completes; voice dots green.

### Phase 7 — Global dictation companion (Sonnet xhigh)
tools/dictate/ Python utility + tray icon + README + uv setup; optional
/api/system/observe for clipboard/window events.
GATE: hotkey dictation lands text in Notepad AND Jarvis chat; survives app
restart; no admin rights.

### Phase 8 — Skill mining (Opus orchestrator + Sonnet fan-out, xhigh)
Extraction fan-out (privacy rules) → synthesis → tasks/skill-mining-report.md
→ Yash sign-off → create approved skills + SKILL.md exports; wire findings
into discoverSkillCandidates heuristics.
GATE: ≥10 evidence-cited proposals, zero leaked secrets (spot-checked);
approved skills runnable with logged runs.

### Phase 9 — Hardening & ship (Sonnet xhigh)
Rewrite HANDOFF.md/README to reality; full regression of section-1 list;
prod build + start smoke; MCP end-to-end from Claude Code; perf pass;
draft PR jarvis-build → main with screenshots + filled verification matrix.
GATE: every matrix row checked; draft PR open; state file complete.

## 4. Risk register

1. Windows voice tooling churn → pin exact release URLs; 30-min binary spike
   opens Phase 6 before any UI work; temp-file fallback.
2. Free-tier rate limits (Gemini RPM/day caps; OpenRouter model churn) →
   cooldowns + visible brain indicator; NVIDIA buffer; Ollama floor.
3. Tool-calling quality varies across fallbacks → chain ordered by tool-call
   reliability; agent tolerates tool-less degraded mode.
4. Google OAuth localhost friction (consent screen, testing-mode refresh
   expiry) → step-by-step doc; re-consent flow documented; state param.
5. WebGL perf with theme animation → 10Hz CSS var throttle, pulse pool cap,
   frameloop pause, perf-trace gate.
6. Transcript privacy in mining → extraction prompts forbid verbatim secrets;
   human review before persistence.
7. Ollama absent → Phase 0 install gate; keyword fallback; honest health dot.
8. Scope creep → Fable checkpoint per phase; Apple/Kokoro/Silero optional;
   state file enforces resume contract.
9. Timestamp migration risk → DB backup first; idempotent logged script.
10. pnpm 11 / Next 16 churn → hono override restored; lockfile committed per
    phase.

## 5. Verification matrix

| Phase | Done means |
|---|---|
| 0 | typecheck+build green (no ignoreBuildErrors); health all-green db/vec/ollama; env provisioned; pushed |
| 1 | Streaming tool-calling chat on Gemini; demonstrated failover; research tools live; timestamps unified |
| 2 | Token/contrast audit documented; screenshots approved by Yash |
| 3 | 60fps trace; theme follows core state live; reduced-motion verified; Yash approves the look |
| 4 | All panels restyled; keyboard pass; honest offline states screenshotted |
| 5 | Live demo per connector + honest disconnect per connector |
| 6 | ≤1.5s first-audio; barge-in; voice tool-call turn end-to-end |
| 7 | Dictation into third-party app demoed; docs complete |
| 8 | Mining report signed off; skills created + run successfully |
| 9 | Full regression; prod build; MCP from Claude Code verified; draft PR open |

## 6. Decisions needing Yash sign-off

1. Keep lucide icons (skip Phosphor migration).
2. Piper default TTS; Kokoro opt-in toggle; Edge-TTS rejected.
3. Python companion for global dictation (not AutoHotkey).
4. Keep Apple connector as-is (zero further investment).
5. Provider order: Gemini → OpenRouter → NVIDIA → Ollama.
6. Phase order above (voice after connectors; skill mining second-to-last).
