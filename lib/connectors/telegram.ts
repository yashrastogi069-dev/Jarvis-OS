import { tool } from "ai"
import { z } from "zod"
import { addEvent } from "@/lib/events"
import { getConnectorConfig, setConnectorConfig } from "@/lib/settings"

/**
 * Telegram connector — free Bot API, long-polling via getUpdates.
 * Local-first: no webhook (no public URL needed). The bot token is stored in
 * connector_settings; the poll offset is persisted so syncs are incremental.
 *
 * Setup: talk to @BotFather -> /newbot -> paste the token in Settings.
 * Then send your bot any message; its chat id is captured on first sync.
 */

const TELEGRAM_API = "https://api.telegram.org"

export interface TelegramSettings extends Record<string, unknown> {
  botToken: string
  /** Captured from the first incoming message; used for sendMessage. */
  defaultChatId?: number
  /** getUpdates offset — last processed update_id + 1. */
  offset?: number
}

export function getTelegramSettings(): TelegramSettings | null {
  const config = getConnectorConfig<TelegramSettings>("telegram")
  if (!config?.botToken) return null
  return config
}

async function tgFetch<T>(token: string, method: string, params?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: params ? JSON.stringify(params) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string }
  if (!json.ok) {
    throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`)
  }
  return json.result as T
}

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    date: number
    text?: string
    chat: { id: number; first_name?: string; username?: string; type: string }
    from?: { first_name?: string; username?: string }
  }
}

/** Verify the token works; returns the bot's username. */
export async function checkTelegram(): Promise<{ ok: boolean; username?: string }> {
  const settings = getTelegramSettings()
  if (!settings) return { ok: false }
  try {
    const me = await tgFetch<{ username: string }>(settings.botToken, "getMe")
    return { ok: true, username: me.username }
  } catch {
    return { ok: false }
  }
}

/**
 * Poll new messages into the unified feed. Incremental via stored offset;
 * captures defaultChatId from the first message seen.
 */
export async function syncTelegramToFeed(): Promise<{ added: number }> {
  const settings = getTelegramSettings()
  if (!settings) return { added: 0 }

  const updates = await tgFetch<TelegramUpdate[]>(settings.botToken, "getUpdates", {
    offset: settings.offset ?? 0,
    timeout: 0, // short poll — this runs inside a request handler
    allowed_updates: ["message"],
  })

  let added = 0
  let maxUpdateId = (settings.offset ?? 1) - 1
  let chatId = settings.defaultChatId
  // Newly-seen inbound messages, acted on AFTER the offset is persisted so the
  // poller can never replay (and re-execute) the same command twice.
  const inbound: { chatId: number; text: string }[] = []

  for (const update of updates) {
    maxUpdateId = Math.max(maxUpdateId, update.update_id)
    const msg = update.message
    if (!msg?.text) continue
    chatId = chatId ?? msg.chat.id
    const sender = msg.from?.username ?? msg.from?.first_name ?? "unknown"
    const isNew = addEvent({
      source: "telegram",
      title: `@${sender}: ${msg.text.slice(0, 160)}`,
      payload: { kind: "message", chatId: msg.chat.id, sender, text: msg.text },
      externalId: `msg-${msg.chat.id}-${msg.message_id}`,
      createdAt: msg.date * 1000,
    })
    if (isNew) {
      added++
      inbound.push({ chatId: msg.chat.id, text: msg.text })
    }
  }

  // Persist the advanced offset BEFORE acting, so a command that fails mid-run
  // can never wedge the poller into replaying the same message forever.
  setConnectorConfig("telegram", {
    ...settings,
    offset: maxUpdateId + 1,
    defaultChatId: chatId,
  })

  // Treat each NEW inbound message as a command to Jarvis: run it through the
  // agent (with all its tools) and reply back to the sender's chat. Previously
  // inbound messages only landed in the feed as passive text and were never
  // acted on — this is the inbound command pipeline.
  for (const item of inbound) {
    await handleInboundTelegramCommand(item.chatId, item.text)
  }

  return { added }
}

/**
 * Run one inbound Telegram message through the agent as a command, then reply to
 * the sender's chat with the result. Best-effort: any failure is caught and a
 * short apology is sent back instead, so it never breaks feed sync. Uses a
 * dynamic import of the agent to avoid a static import cycle
 * (agent -> connector registry -> telegram).
 */
async function handleInboundTelegramCommand(chatId: number, text: string): Promise<void> {
  try {
    const { collectOsAgentResponse } = await import("@/lib/agent")
    const { text: reply } = await collectOsAgentResponse(text, {
      extraContext:
        "This message arrived over Telegram from the user's phone. Treat it as a command: " +
        "act on it with your tools (create tasks/reminders, save memory, search, etc.), then " +
        "reply with a short, phone-friendly confirmation of what you did. If you couldn't do " +
        "it, say so plainly in one line.",
    })
    await sendTelegramMessage((reply.trim() || "Done.").slice(0, 4000), chatId)
  } catch (error) {
    console.error("[telegram] inbound command failed:", error)
    try {
      await sendTelegramMessage(
        "Sorry — I couldn't process that just now. Please try again.",
        chatId,
      )
    } catch {
      // Nothing more we can do if even the error reply fails.
    }
  }
}

/** Send a message from the bot to the user's chat. */
export async function sendTelegramMessage(text: string, chatId?: number): Promise<void> {
  const settings = getTelegramSettings()
  if (!settings) throw new Error("Telegram is not configured. Add a bot token in Settings.")
  const target = chatId ?? settings.defaultChatId
  if (!target) {
    throw new Error("No chat id known yet. Send your bot a message first, then sync the feed.")
  }
  await tgFetch(settings.botToken, "sendMessage", { chat_id: target, text })
}

/* ---------- Agent tools ---------- */

export const telegramTools = {
  sendTelegram: tool({
    description:
      "Send a Telegram message to the user's phone via their bot. Use when asked to 'send me', 'remind me on telegram', or push a summary to their phone.",
    inputSchema: z.object({
      text: z.string().max(4000).describe("The message text to send."),
    }),
    execute: async ({ text }) => {
      await sendTelegramMessage(text)
      return { sent: true }
    },
  }),
  getTelegramMessages: tool({
    description: "Fetch new incoming Telegram messages into the feed and return recent ones.",
    inputSchema: z.object({}),
    execute: async () => {
      const { added } = await syncTelegramToFeed()
      const { getRecentEvents } = await import("@/lib/events")
      return {
        newMessages: added,
        recent: getRecentEvents(10, "telegram").map((e) => e.title),
      }
    },
  }),
}
