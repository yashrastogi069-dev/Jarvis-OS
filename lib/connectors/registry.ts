import fs from "node:fs"
import type { Tool } from "ai"
import { obsidianTools, checkObsidian, syncObsidianToFeed } from "@/lib/connectors/obsidian"
import { githubTools, syncGithubToFeed } from "@/lib/connectors/github"
import { telegramTools, getTelegramSettings, checkTelegram, syncTelegramToFeed } from "@/lib/connectors/telegram"
import { googleTools, getGoogleSettings, isGoogleConnected, syncGoogleToFeed } from "@/lib/connectors/google"
import { appleTools, getAppleSettings, checkApple, syncAppleToFeed } from "@/lib/connectors/apple"
import { getObsidianSettings } from "@/lib/settings"
import { WHISPER_BIN, WHISPER_MODEL, PIPER_BIN, PIPER_VOICE, STT_PYTHON, STT_SERVER_SCRIPT } from "@/lib/voice/paths"

/**
 * Single source of truth for the five OS connectors (plus voice + the not-
 * yet-wired system entry). Before this file existed, connector wiring was
 * scattered across lib/agent.ts (a hardcoded INSTRUCTIONS bullet list),
 * lib/assistant/prompt.ts (a second, independently-drifting copy of similar
 * prose), and ad hoc imports in each consuming module. Now:
 *   - `connectorTools` replaces the five separate tool-object spreads in
 *     lib/agent.ts's `allTools`.
 *   - `connectorPromptLines()` replaces the hardcoded bullet block in
 *     lib/agent.ts's INSTRUCTIONS string.
 *   - `probe` gives a uniform status check per connector for future health/
 *     status-bar consolidation (out of scope for this pass — see
 *     app/api/health/route.ts and components/status-bar.tsx, untouched here).
 *
 * Order matches today's status bar dots (components/status-bar.tsx
 * DOT_DESCRIPTORS): obsidian, github, telegram, google, apple, voice — with
 * `system` appended last since it has no dot yet (Phase 7).
 */

export type ProbeStatus = "ok" | "warn" | "off"

export interface ProbeResult {
  status: ProbeStatus
  detail?: Record<string, boolean | number | string>
  reason?: string
}

export interface ConnectorEntry {
  id: "github" | "obsidian" | "telegram" | "google" | "apple" | "voice" | "system" | (string & {})
  label: string
  promptHint: string
  probe: (opts?: { live?: boolean }) => Promise<ProbeResult>
  sync?: () => Promise<{ added: number }>
  tools: Record<string, Tool>
  feedSources?: string[]
}

export const CONNECTORS: ConnectorEntry[] = [
  {
    id: "obsidian",
    label: "Obsidian",
    promptHint: "Obsidian vault: search, read, append, and create notes (when the connector is configured).",
    // Preserves app/api/health/route.ts's `probeObsidian` behavior exactly:
    // it is a real live fetch, unconditionally, not a config-presence check.
    // Passing live:false explicitly still allows a cheap config-only check
    // for callers that want to avoid the network round trip.
    probe: async (opts) => {
      if (opts?.live === false) {
        const configured = Boolean(getObsidianSettings())
        return { status: configured ? "warn" : "off", detail: { configured, ok: false } }
      }
      const result = await checkObsidian()
      return {
        status: result.ok ? "ok" : result.configured ? "warn" : "off",
        detail: { configured: result.configured, ok: result.ok },
      }
    },
    sync: syncObsidianToFeed,
    tools: obsidianTools,
    feedSources: ["obsidian"],
  },
  {
    id: "github",
    label: "GitHub",
    promptHint: "GitHub: notifications, PRs, issues, recent commits (when GITHUB_TOKEN is set).",
    probe: async () => {
      const configured = Boolean(process.env.GITHUB_TOKEN)
      return configured
        ? { status: "ok", detail: { configured } }
        : { status: "off", detail: { configured }, reason: "GITHUB_TOKEN is not set" }
    },
    sync: syncGithubToFeed,
    tools: githubTools,
    feedSources: ["github"],
  },
  {
    id: "telegram",
    label: "Telegram",
    promptHint:
      "Telegram: sendTelegram pushes messages to the user's phone; getTelegramMessages pulls new ones (when a bot token is configured).",
    probe: async (opts) => {
      const configured = Boolean(getTelegramSettings()?.botToken)
      if (opts?.live) {
        const result = await checkTelegram()
        return {
          status: result.ok ? "ok" : configured ? "warn" : "off",
          detail: { configured, ok: result.ok, ...(result.username ? { username: result.username } : {}) },
        }
      }
      return {
        status: configured ? "ok" : "off",
        detail: { configured, ok: false },
      }
    },
    sync: syncTelegramToFeed,
    tools: telegramTools,
    feedSources: ["telegram"],
  },
  {
    id: "google",
    label: "Google",
    promptHint:
      "Google: getCalendarEvents / getRecentEmails / searchGmail / readEmail / replyToEmail / searchCalendarEvents / updateCalendarEvent / deleteCalendarEvent (when the user connects Google in Settings). searchGmail supports Gmail's own query syntax (from:, subject:, after:, has:attachment). readEmail fetches the full body of a specific message by id -- use it after searchGmail/getRecentEmails to actually read content, not just the subject/snippet. updateCalendarEvent, deleteCalendarEvent, and replyToEmail require confirmation: call with confirmed:false first to preview, then confirmed:true only after the user explicitly approves.",
    probe: async () => {
      const credentials = Boolean(getGoogleSettings())
      const connected = isGoogleConnected()
      return {
        status: connected ? "ok" : credentials ? "warn" : "off",
        detail: { credentials, connected },
      }
    },
    sync: syncGoogleToFeed,
    tools: googleTools,
    feedSources: ["gcal", "gmail"],
  },
  {
    id: "apple",
    label: "Apple",
    promptHint:
      "Apple Calendar: getAppleCalendarEvents / searchAppleCalendarEvents / updateAppleCalendarEvent / deleteAppleCalendarEvent via iCloud (when Apple ID + app password are configured). updateAppleCalendarEvent and deleteAppleCalendarEvent require confirmation: call with confirmed:false first to preview, then confirmed:true only after the user explicitly approves.",
    probe: async (opts) => {
      const configured = Boolean(getAppleSettings()?.appleId && getAppleSettings()?.appPassword)
      if (opts?.live) {
        const ok = await checkApple()
        return {
          status: ok ? "ok" : configured ? "warn" : "off",
          detail: { configured, ok },
        }
      }
      return {
        status: configured ? "ok" : "off",
        detail: { configured, ok: false },
      }
    },
    sync: syncAppleToFeed,
    tools: appleTools,
    feedSources: ["icloud"],
  },
  {
    id: "voice",
    label: "Voice",
    promptHint: "",
    probe: async () => {
      const sidecar = fs.existsSync(STT_PYTHON) && fs.existsSync(STT_SERVER_SCRIPT)
      const whisper = fs.existsSync(WHISPER_BIN) && fs.existsSync(WHISPER_MODEL)
      const stt = sidecar || whisper
      const piper = fs.existsSync(PIPER_BIN) && fs.existsSync(PIPER_VOICE)
      return {
        status: stt && piper ? "ok" : stt || piper ? "warn" : "off",
        detail: { stt, sidecar, whisper, piper },
      }
    },
    tools: {},
  },
  {
    id: "system",
    label: "System",
    promptHint: "",
    probe: async () => ({ status: "off", reason: "not yet wired (Phase 7)" }),
    tools: {},
  },
]

export const connectorTools: Record<string, Tool> = Object.assign({}, ...CONNECTORS.map((c) => c.tools))

export function getConnector(id: string): ConnectorEntry | undefined {
  return CONNECTORS.find((c) => c.id === id)
}

export function connectorPromptLines(): string {
  return CONNECTORS.filter((c) => c.promptHint)
    .map((c) => `- ${c.promptHint}`)
    .join("\n")
}
