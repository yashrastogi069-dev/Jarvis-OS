# JARVIS — Master Forward Plan (v2)

> **HISTORICAL / LEGACY PRODUCT ROADMAP**
>
> This document preserves the pre-Jarvis-Core-V2 product roadmap.
>
> It is not the active Core V2 engineering execution plan.
>
> The active Core V2 execution authority is `tasks/ACTIVE_PLAN.md`.
>
> The active Core V2 branch is `jarvis-core-v2`.
>
> Where this file conflicts with current Core V2 governance documents or repository source, the current Core V2 documents/source are authoritative.

Author: Fable (synthesis of four Fable planning passes, 2026-07-12).
Supersedes the Phase 4-9 sections of `tasks/PLAN.md` (v1). Phases 0-3 are
DONE; this document is the authoritative plan for everything that remains.

Branch: `jarvis-build` only. Never force-push, never push to `main`.
Standing hold point: **Phase 4 does not start without Yash's explicit
approval.** Nothing here executes until then.

Path hygiene (lesson 15): every path in this file uses forward slashes —
Tailwind v4's content scanner parses `\` + hex digits in any tracked file as a
CSS unicode escape and hard-fails `pnpm build`. Never write backslash paths
here.

---

## 0. Where we are

- **Phases 0-2 COMPLETE**: env + hygiene, the multi-provider brain chain
  (Gemini 2.5 Flash → Groq → OpenRouter free → NVIDIA NIM → Ollama, streaming,
  tool-calling, research tools), and the Arc-Reactor OKLCH design system.
- **Phase 3 COMPLETE** (Chunks A-D): theme engine, the full-viewport WebGL
  stage, the Arc Reactor (Mark-VI triangular core, bloom, click/Alt+J to talk),
  and the neural network (full-screen holographic energy field: z-depth glow
  points, radar sweep, shape-morph, auto join/disjoin, color-cycle). Gates
  green, committed, pushed.
- **Already built outside this repo**: a working WhisperFlow-style dictation
  MVP at `C:/Users/win 10/Desktop/Whisper clone` (Python, faster-whisper base
  int8 CPU, hold-Right-Ctrl → paste anywhere, neon overlay). Phase 7 adopts and
  finishes it; the LLM-cleanup stage is a deliberate stub today.

Everything below is **approval-gated**.

---

## 1. Cross-cutting decisions (Fable synthesis — read before any phase)

These reconcile the four per-phase plans so they compose into one system.

1. **One notification queue, not two.** Phase 6 (in-tab reminder toasts) and
   Phase 7 (out-of-tab Windows toasts + phone push) both want to surface
   reminders/events. They share ONE `notifications` table and ONE dedupe key.
   The scheduler (Phase 6) writes rows; both the in-tab SSE toasts and the
   companion's poller consume the same rows and ack them. A reminder can never
   fire twice through two parallel systems. Build the table in whichever of
   Phase 6/7 lands first; the other reuses it.

2. **One headless agent helper.** Phase 7's `/api/system/command` and Phase 6's
   voice loop both need a non-streaming "run one agent turn and return the
   text" path. Define `collectOsAgentResponse()` in `lib/agent.ts` once (in the
   first of the two phases to execute) alongside the existing
   `streamOsAgentResponse()`; the other phase imports it. Same tool-capable
   chain, same `agent_runs` logging so skill discovery (Phase 8) learns from
   voice + command usage.

3. **The assistant-capability wishlist maps to concrete organs** (see the table
   in §2). It is delivered mostly by Phase 6's intelligence layer and Phase 7's
   proactive layer, not as a separate phase.

4. **Registry-first (Phase 5) shapes later phases.** Write Phase 6's `voice`
   status and Phase 7's `system` (dictation companion) presence as connector
   registry entries so they light up in health/status-dots with honest
   probe-only states until their pipelines exist.

5. **Model routing (lesson 7).** Doc/state-file chores → Haiku. Design/taste
   reviews and the flagship voice/assistant work → Fable (the Chunk C/D
   executor override stands for this track). Mechanical fan-out (skill mining,
   regression) → Sonnet xhigh. Pin `model` explicitly on every Workflow
   `agent()` call (inheritance bug).

6. **Every phase ends the same way**: typecheck 0 → `pnpm build` green → live
   verify on :3100 → screenshot → commit to `jarvis-build` → push → update
   `JARVIS_BUILD_STATE.md`. Honest failure surfacing is mandatory on every
   feature (UI state + `system_events` + ntfy where relevant).

---

## 2. Assistant-capability wishlist → where it is built

Yash's requirements (interpret intent; retrieve/process info; coherent concise
context-aware responses; multi-turn context retention; task management
—scheduling/reminders/retrieval; access external data; proactive assistance;
polite/adaptable tone) map as:

| Capability | Delivered by | Concretely |
|---|---|---|
| Interpret intent accurately | Phase 6 | Per-turn context injection (time, memories, open tasks, tone) + the tool-calling chain; no brittle regex router |
| Retrieve/process info, external data | Live today + Phase 6 | `webSearch`/`fetchPage` tools already exist; auto-inject top memories so voice skips a round-trip |
| Coherent, concise, contextual replies | Phase 6 | Voice response contract (≤3 sentences, no markdown read aloud), persona prompt |
| Multi-turn context retention | Phase 6 | `chat_sessions`/`chat_messages` tables, rolling summary, session resume on load |
| Task management (schedule/remind/retrieve) | Phase 6 | `tasks` table + agent tools (create/list/complete/snooze) + `lib/scheduler.ts` firing reminders |
| Proactive assistance | Phase 7 (+6) | Trigger catalog (reminder due, calendar soon, job finished, morning digest, connector down) → toasts/feed/ntfy with guardrails |
| Polite, adaptable tone | Phase 6 | `assistant` preferences (tone/verbosity/address/voice) persisted, editable by voice ("be more casual") and in Settings |
| Reach the user outside the tab | Phase 7 | Companion process = notification host (Windows toasts + ntfy phone push); F9 "ask Jarvis from any app" |

---

## 3. Phase 4 — Shell & panels redesign

**Mission.** Bring the five panel interiors + status bar up to the Phase-3
glass system and migrate all icons lucide-react → `@phosphor-icons/react`
(thin/duotone, Yash's standing call). Build restyle as **reusable primitives
with documented extension points** so Phase 6's new surfaces (tasks panel,
toasts, 6th rail icon, voice dot) drop in as data, not rework.

**Chunks**
- **4A — Phosphor migration (S).** `package.json` (add phosphor, drop lucide);
  `components/hud/edge-rail.tsx`, `hud-shell.tsx`, `panel-overlay.tsx`,
  `components/status-bar.tsx` (the only 4 lucide importers — verified). Gate:
  `grep lucide` = 0; typecheck/build; icon sizes match.
- **4B — Panel kit + status bar + readout honesty (M).** NEW
  `components/hud/panel-kit.tsx` (SectionHeading, HairlineRow, Ghost/Accent
  buttons, HudInput, SeedBadge, StaggerList); `app/globals.css` (+`--ease-hud`,
  one entrance keyframe with reduced-motion override); `status-bar.tsx`
  (extend `HealthData` with telegram/google/apple fields the API already
  returns → data-driven `DOT_DESCRIPTORS`, incl. a first-class `voice` dot;
  aggregate dot below lg); `core-readout.tsx` (fix: show `data.brain.active`,
  not the stale `chat.brain`); `edge-rail.tsx` (index-derived hotkey labels so
  a 6th item is a one-line append; document the 4 add-a-panel touchpoints;
  reserve the top-right z-50 slot for toasts).
- **4C — Five panel interiors (L).** `feed-panel.tsx`, `memory-panel.tsx`,
  `notes-panel.tsx`, `skills-panel.tsx`, `settings-panel.tsx` onto the kit;
  replace `window.prompt`/boxed cards with inline glass controls; tabular
  figures; focus-visible rings everywhere. Preserve every honest-fallback
  badge and SWR wiring exactly.
- **4D — Batched verify + Fable taste review + ship (S).** Per-panel
  screenshots, keyboard-only pass, offline matrix; a formal Fable taste review
  (lesson 11a). Fold in the still-outstanding Phase-3 deferred checks
  (reduced-motion re-check, tab-hidden, perf trace, B-redesign confirmation).

**Done means:** zero lucide, all panels on panel-kit with a passed taste
review, honest registry-ready dots incl. voice, keyboard pass, extension
points documented, gates green, pushed.

---

## 4. Phase 5 — Connector framework + depth

**Mission.** Replace five hand-wired connectors with a registry
(`{id, label, probe, sync, tools}`) that health/feed/status-dots/agent-tools
all iterate; fix the Google OAuth CSRF hole; stop leaking the MCP key; add a
keyless local-filesystem connector; deepen Obsidian.

**Chunks**
- **5A — Registry core + consumer flip (M).** NEW
  `lib/connectors/registry.ts` (8 entries: github/obsidian/telegram/google/
  apple/local + `voice` + `system`, the last two probe-only/honest until
  6/7); flip `app/api/health`, `app/api/feed`, `lib/agent.ts` tool spreads,
  and the status bar to iterate it.
- **5B — OAuth state + MCP masking (M).** `lib/connectors/google.ts` +
  `app/api/google/callback` (random `state`, verified/cleared, errors logged
  not swallowed); `app/api/settings` GET returns masked key, reveal only on
  explicit POST; fix two hardcoded `localhost:3000` → `window.location.origin`
  (dev is :3100); NEW `docs/google-oauth-setup.md`.
- **5C — Local-system connector (M).** add `chokidar`; NEW
  `lib/connectors/local.ts` (globalThis-guarded singleton watcher, debounce +
  burst-coalesce + 30/min cap, `listRecentFileChanges` tool); settings UI +
  actions.
- **5D — Obsidian depth (M).** `appendDailyNote` tool; `reindexNote` +
  `replaceNoteMemories` in `lib/memory.ts` (delete-then-resave to avoid dupes);
  auto-index via the local watcher when a folder is the vault.
- **5E — Live matrix + legacy-field removal + ship (S).** Per-connector live
  demo + honest-disconnect matrix; drop the legacy per-connector health fields.

**Done means:** registry drives everything with voice+system entries present;
live demo + honest disconnect per connector; tampered OAuth state rejected
(curl-proven); `/api/settings` leaks no key; gates green.

---

## 5. Phase 6 — Voice mode 1 + assistant intelligence core (FLAGSHIP)

**Mission.** Click the reactor (or Alt+J), speak, and within ~1.5-2s hear a
coherent, correctly-informed, personality-consistent answer, with the reactor
and OS choreographing listening/thinking/speaking — and make the brain behind
it genuinely capable (intent, memory, tasks, tone). This is the phase Yash
wants to be "the best."

### 5.1 Voice pipeline
`mic → AudioWorklet capture (16k, pre-roll) → energy VAD → /api/voice/transcribe
(STT chain) → streaming brain → sentence chunker → /api/voice/speak (Piper
daemon) → gapless Web Audio playback`, with **barge-in** (VAD during playback →
fade+flush+abort) and a **follow-up window** (mic re-opens briefly after each
answer). The reactor is the surface: `coreState` + `micLevel` already
choreograph it (Phase 3) — Phase 6 only feeds the store correctly.

**STT decision (answers Yash's Whisper-clone question): faster-whisper (base,
int8, CPU) is the PRIMARY engine**, whisper.cpp the fallback. Rationale: it's
the only engine with a measured number on this exact i3 (RTF ≈ 0.19) and it
reuses the model the dictation tool already cached. A managed sidecar
(`tools/stt-server/`, NEW) binds `127.0.0.1:8765`; the STT chain uses ANY
server already on that port, so **Phase 7 makes one resident model serve both
the dictation app and Jarvis** — no duplicate 500MB on an 8GB machine. Both
sidecar and the Piper daemon idle-unload.

**Files (NEW unless noted):** `lib/voice/recorder.ts` (rewrite, AudioWorklet +
writes `micLevel`), `public/worklets/capture-processor.js`, `lib/voice/vad.ts`,
`lib/voice/sentence-chunker.ts`, `lib/voice/tts-queue.ts`,
`components/voice/voice-controller.tsx` (owns the state machine; moves the
`jarvis:toggle-mic` listener here), `components/chat-provider.tsx` (shared
`useChat` for text + voice), `lib/voice/stt.ts` (engine chain),
`tools/stt-server/server.py` (+requirements), `lib/voice/piper.ts` (persistent
daemon), `app/api/voice/transcribe|speak` (rewrite), `app/api/voice/status`
(NEW), `scripts/setup-voice.ps1` (NEW, pinned Windows binaries — replaces the
bash-only `setup-voice.sh`), `lib/voice/paths.ts` (fix `.exe` on win32).

### 5.2 Assistant intelligence
Reuse the live brain chain, tool loop, memory engine, events feed. Add four
organs:
- **Conversations**: `chat_sessions` + `chat_messages` tables (SCHEMA_VERSION
  +1, idempotent DDL, DB backup first), `lib/sessions.ts`, rolling
  summarization, `app/api/sessions/*`; chat route persists + resumes.
- **Per-turn context (= accurate intent)**: `lib/assistant/context.ts` injects
  current local time, top-5 memories, open tasks <48h, tone block, session
  summary before each turn; `lib/assistant/prompt.ts` (persona + voice response
  contract).
- **Tasks/reminders**: `tasks` table; `lib/tasks.ts` (CRUD + recurrence);
  agent tools (create/list/complete/snooze/update); `lib/scheduler.ts`
  (globalThis-guarded 30s interval from NEW `instrumentation.ts`) fires due
  reminders → the shared `notifications` table + events feed + optional
  Telegram push; missed-while-off reminders announced once on restart. Honest
  limit stated: reminders fire while Jarvis is running (Phase 7 adds the
  always-on companion host). Surfacing: `app/api/notifications` SSE +
  `components/hud/notification-toasts.tsx` + `components/tasks-panel.tsx` (6th
  edge-rail icon); if a voice session is active, reminders are spoken.
- **Tone/preferences**: stored in `connector_settings` under `assistant`;
  `setPreference` tool ("be more casual" persists) + Settings UI + Voice
  section.

### 5.3 Chunks (A→G)
A Windows voice foundation + benchmark spike · B server voice infra (stt chain,
piper daemon, status) · C client voice loop (worklet, VAD, chunker, TTS queue,
controller, chat-provider lift) · D sessions + context core · E tasks +
reminders + notifications · F latency optimization + proactivity + polish · G
verification matrix + hardening, then **STOP for Yash before Phase 7**.

### 5.4 Latency budget (i3, no GPU): first audio p50 ≤ 1.8s / p90 ≤ 3.0s
(measured, per-stage logged); barge-in < 300ms. Stages: VAD hangover 300-400ms,
STT ~0.3-0.8s (rolling decode), brain first sentence ~0.7-1.3s, TTS first chunk
~0.45-0.7s, playback ~30ms.

**Done means:** ≥9/10 intent test set; refresh restores conversation; "be more
casual" persists across restart; 2-minute reminder fires end-to-end (toast +
feed + spoken); latency table committed; every degraded path honest;
RAM measured with the dictation app also running; Fable taste review.

---

## 6. Phase 7 — Dictation companion + system presence + proactive assistance

**Mission.** Turn the finished dictation MVP into the body of Jarvis outside the
browser: one always-on companion that (a) dictates anywhere with optional AI
cleanup, (b) answers "ask Jarvis from any app" via F9 → Windows toast, and (c)
is Jarvis's notification host so reminders/events reach Yash (toasts + ntfy
phone push) even with the tab closed.

**Repo decision:** adopt the tool into the Jarvis repo as `tools/dictate/`
(add `@source not "../tools";` to `app/globals.css` so Tailwind never scans it;
gitignore its `.venv`, caches, and `config.json` which holds the token; ship
`config.example.json`). Leave the Desktop copy until a live test passes.

**Jarvis ↔ companion API** (all under `app/api/system/*`, auth = a dedicated
32-hex `system` token via `getSystemToken()`, bearer, `timingSafeEqual`,
rate-limited): `/cleanup` (editor-role prompt on the brain chain, 4s timeout,
pass-through on failure), `/observe` (transcript/window events → feed/memory),
`/command` (headless `collectOsAgentResponse()` turn → reply, logs `agent_runs`),
`/notifications` GET (sweep + fetch) / POST (ack/snooze).

**Proactive engine:** the companion's 30s poll drives a self-throttled trigger
sweep (`lib/assist/triggers.ts`): reminder due (Phase 6 table, feature-flagged),
calendar event soon, long job finished, morning digest, connector down.
Channels: Windows toasts (windows-toasts, Dismiss/Snooze actions) + events feed
+ ntfy.sh phone push (NEW `lib/notify.ts`, fire-and-forget) for phone-worthy
kinds. Guardrails: quiet hours (queue, never drop), 4/h + 12/day caps, per-kind
toggles, snooze.

**Hotkey seam:** Right-Ctrl dictate · F9 ask-Jarvis · Alt+J in-tab mic — no
clashes. Clipboard surveillance is explicitly OUT (privacy); only the
foreground-window title at dictation moments.

**Chunks:** 0 repo adoption · 1 Jarvis API surface · 2 companion completion
(real cleanup.py, tray icon, observe) · 3 ask-Jarvis-anywhere (F9 → toast) · 4
proactive engine (notifications table shared with Phase 6, triggers,
guardrails, notifier) · 5 docs + closeout.

**Done means:** dictation from the new home (raw when Jarvis down, polished when
up); F9 toast with a real tool-using answer; a reminder toast within 60s of due
with the browser closed, no duplicates, quiet-hours respected; ntfy on phone;
tray Quit works; no secrets committed.

---

## 7. Phase 8 — Skill mining from Claude Code transcripts

**Mission.** Mine the local Claude Code session transcripts for Yash's recurring
task patterns → ranked, evidence-cited proposals → sign-off → create approved
skills in the Skill Factory, and make discovery continuous.

**Corpus (measured):** 101 top-level session transcripts (~124 MB) across 19
project dirs (veritas dominant, then praxis, job-scorer, Whisper-clone, misc);
421 files incl. subagent/journal (excluded). Largest single files 8-15 MB →
projection-only reads.

**Method:** NEW `scripts/mine/project-transcript.mjs` streams each `.jsonl` to a
tiny redacted projection (regex-redact secrets at projection time = privacy
layer 1). 6 byte-balanced extractor subagents (Sonnet) → structured JSON with
citation = session-uuid + approx location (never raw quotes). One synthesis
pass dedups + scores (frequency × automatability × value) → `≥10` proposals in
`tasks/skill-mining-report.md`. **Privacy is a hard 4-layer gate**
(projection redaction, prompt prohibitions, `scripts/mine/scan-secrets.mjs`
mechanical scan, 20% human spot-check + 100% of job-scorer). `tasks/mining/`
gitignored; only the cleared report is tracked. Human sign-off before anything
persists. Then create via `POST /api/skills` (`sourceTask:
"transcript-mining"`), export SKILL.md, run+rate ≥1 (incl. via MCP), and wire
`MINED_PATTERN_FAMILIES` into `discoverSkillCandidates()`.

**Done means:** 101/101 extracted, scanner clean + spot-check, ≥10 evidenced
proposals, Yash sign-off, skills created + a rated run, `~/.claude/projects`
untouched, no transcript bytes tracked.

---

## 8. Phase 9 — Hardening & ship

**Mission.** Prove every claim. Re-verify the debt list (active probes, not code
reads), burn down the deferred-checks backlog, regression-test the full surface
incl. the Phase 6 voice stack + scheduler + STT sidecar and the Phase 7
companion + `app/api/system/*` + notifications, pass a prod build + `next start`
smoke, verify MCP end-to-end from Claude Code, hit perf targets (+ prove the
governor's one-way degradation), scrub secrets **including git history**
(`KeysJarvis.env`, `.env.local`, `data/*.db`, model binaries, `tools/*`),
add a `scripts/backup-db.mjs` + docs, rewrite `HANDOFF.md` + `README.md` to
reality, and open a **draft** PR `jarvis-build → main` with screenshots + the
filled `tasks/SHIP_GATE.md` matrix.

**Chunks:** 9.0 gate file · 9.1 debt sweep (items 1-15) · 9.2 deferred backlog
(streamed failover, NVIDIA NIM, fetchPage, Ollama floor, thinking/reduced-motion/
tab-hidden/perf) · 9.3 perf pass + governor forced-degradation · 9.4 Phase 6/7
surface regression + idempotent-migration-on-fresh-DB · 9.5 secrets + hygiene
scan (worktree + history) · 9.6 backup script + docs · 9.7 prod build + start
smoke (sidecars started + probed) · 9.8 MCP e2e (8 tools + 401 path) · 9.9 docs
rewrite (Haiku + Fable review) · 9.10 draft PR.

**Done means:** every SHIP_GATE row evidenced; docs rewritten from evidence;
draft PR open; `main` untouched; merge is Yash's call.

---

## 9. Dependency order & what unblocks what

```
Phase 3 (done) ─▶ [HOLD: Yash approval]
                      │
                      ├─▶ Phase 4 ─▶ Phase 5 ─┐
                      │   (panels)   (registry)│
                      │                        ▼
                      └─▶ Phase 6 (voice + intelligence, flagship)
                              │   defines: notifications table, tasks model,
                              │            collectOsAgentResponse(), :8765 STT
                              ▼
                          Phase 7 (companion + proactive; reuses all four)
                              ▼
                          Phase 8 (skill mining; independent, can slot earlier)
                              ▼
                          Phase 9 (harden + draft PR)
```
Phase 6 has no hard dependency on Phases 4/5 (its voice dot is added to the
status bar directly and folds into the registry later), so if Yash wants the
flagship first, 6 can run right after the hold. Recommended order keeps 4→5
before 6 so the new voice/tasks UI lands on the Phase-4 primitives.

---

## 10. Risk register (top items across phases)

1. **Windows voice tooling / Piper daemon behavior** → Phase 6 Chunk A benchmark
   spike with real binaries before any UI; fallback ladder daemon → one-shot →
   text-only honest error.
2. **Latency budget on the i3** → measured gate at 1.8s (not aspirational 1s),
   per-stage logs, named optimization levers (rolling decode, clause chunking,
   low voice).
3. **RAM (8 GB) with dictation + sidecar + dev server + Chrome** → idle
   auto-unload, shared :8765 model (one resident engine for both), whisper-cli
   zero-resident floor; measured in Phase 9.
4. **Secrets in git history** → Phase 9 history audit is a hard gate before the
   PR; escalate to Yash if dirty (never a unilateral rewrite).
5. **Transcript privacy (Phase 8)** → 4-layer defense + human gate; only the
   cleared report is ever tracked.
6. **Usage-limit cutoffs mid-run** → per-chunk checkpoint files
   (`JARVIS_BUILD_STATE.md`, `tasks/mining/MANIFEST.json`, `tasks/SHIP_GATE.md`)
   are the resume contract.

---

*End of v2 master plan. The four detailed per-phase Fable plans this
synthesizes are preserved in the session transcript; this file is the working
contract. Execute only after Yash approves Phase 4.*
