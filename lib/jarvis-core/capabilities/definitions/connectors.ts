/**
 * JARVIS CORE V2 — CONNECTOR CAPABILITY DEFINITIONS
 * 
 * Capabilities integrating with external platforms / accounts:
 * - GitHub (6 tools): notifications, PRs, issues, commits, create issue, comment
 * - Google (10 tools): calendar list/search/create/update/delete, mail list/search/read/send/reply
 * - Apple (5 tools): calendar list/search/create/update/delete
 * - Telegram (2 tools): sendTelegram, getTelegramMessages
 * - Obsidian (4 tools): notes search, read, append, create
 * 
 * Total: 27 capabilities
 */

import { asCapabilityId } from "../../types"
import type { CapabilityDefinition } from "../types"
import { CapabilityOperationalError } from "../result"
import { githubTools } from "@/lib/connectors/github"
import { googleTools, getGoogleSettings, isGoogleConnected } from "@/lib/connectors/google"
import { appleTools, getAppleSettings } from "@/lib/connectors/apple"
import { telegramTools, getTelegramSettings } from "@/lib/connectors/telegram"
import { obsidianTools } from "@/lib/connectors/obsidian"
import { getObsidianSettings } from "@/lib/settings"

// Helper to extract schema and execute from AI SDK tool
function fromConnectorTool(t: any): { description: string; inputSchema: any; execute: (args: any, context?: any) => Promise<any> } {
  return {
    description: t.description,
    inputSchema: t.inputSchema,
    execute: async (args: any, context?: any) => {
      if (context?.signal?.aborted) {
        const err: any = new Error("Connector operation cancelled by signal")
        err.code = "CANCELLED"
        throw err
      }
      return t.execute(args)
    },
  }
}

// ============================================================================
// 1. GITHUB (6 capabilities)
// ============================================================================

const ghNotifications = fromConnectorTool((githubTools as any).getGithubNotifications)
const ghPRs = fromConnectorTool((githubTools as any).getMyOpenPRs)
const ghIssues = fromConnectorTool((githubTools as any).getMyOpenIssues)
const ghCommits = fromConnectorTool((githubTools as any).getRecentCommits)
const ghCreateIssue = fromConnectorTool((githubTools as any).createGithubIssue)
const ghCommentIssue = fromConnectorTool((githubTools as any).commentOnGithubIssue)

export const githubCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("github.notifications.list"),
    legacyToolName: "getGithubNotifications",
    domain: "github",
    title: "Get GitHub Notifications",
    description: ghNotifications.description,
    inputSchema: ghNotifications.inputSchema,
    handler: ghNotifications.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredEnv: ["GITHUB_TOKEN"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(process.env.GITHUB_TOKEN),
        reason: process.env.GITHUB_TOKEN ? undefined : "GITHUB_TOKEN is not set",
      }),
    },
    routing: { keywords: ["github", "notifications", "alerts", "inbox"], domainHints: ["GitHub"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("github.prs.list"),
    legacyToolName: "getMyOpenPRs",
    domain: "github",
    title: "Get Open Pull Requests",
    description: ghPRs.description,
    inputSchema: ghPRs.inputSchema,
    handler: ghPRs.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredEnv: ["GITHUB_TOKEN"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(process.env.GITHUB_TOKEN),
        reason: process.env.GITHUB_TOKEN ? undefined : "GITHUB_TOKEN is not set",
      }),
    },
    routing: { keywords: ["github", "pull request", "pr", "open prs"], domainHints: ["GitHub"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("github.issues.list"),
    legacyToolName: "getMyOpenIssues",
    domain: "github",
    title: "Get Open Issues",
    description: ghIssues.description,
    inputSchema: ghIssues.inputSchema,
    handler: ghIssues.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredEnv: ["GITHUB_TOKEN"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(process.env.GITHUB_TOKEN),
        reason: process.env.GITHUB_TOKEN ? undefined : "GITHUB_TOKEN is not set",
      }),
    },
    routing: { keywords: ["github", "issues", "my issues", "assigned issues"], domainHints: ["GitHub"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("github.commits.list"),
    legacyToolName: "getRecentCommits",
    domain: "github",
    title: "Get Recent Commits",
    description: ghCommits.description,
    inputSchema: ghCommits.inputSchema,
    handler: ghCommits.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredEnv: ["GITHUB_TOKEN"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(process.env.GITHUB_TOKEN),
        reason: process.env.GITHUB_TOKEN ? undefined : "GITHUB_TOKEN is not set",
      }),
    },
    routing: { keywords: ["github", "commits", "recent commits", "git log"], domainHints: ["GitHub"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("github.issue.create"),
    legacyToolName: "createGithubIssue",
    domain: "github",
    title: "Create GitHub Issue",
    description: ghCreateIssue.description,
    inputSchema: ghCreateIssue.inputSchema,
    handler: ghCreateIssue.execute,
    actionClass: "EXTERNAL_CREATE",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      previewSupported: true,
      reason: "Creates public or repository issue on GitHub.",
    },
    idempotency: {
      idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
      duplicateRisk: "Repeat execution on confirmed: true creates duplicate issue.",
    },
    requirements: { requiredEnv: ["GITHUB_TOKEN"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(process.env.GITHUB_TOKEN),
        reason: process.env.GITHUB_TOKEN ? undefined : "GITHUB_TOKEN is not set",
      }),
    },
    routing: { keywords: ["github", "create issue", "open issue", "file bug"], domainHints: ["GitHub"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("github.issue.comment"),
    legacyToolName: "commentOnGithubIssue",
    domain: "github",
    title: "Comment on GitHub Issue",
    description: ghCommentIssue.description,
    inputSchema: ghCommentIssue.inputSchema,
    handler: ghCommentIssue.execute,
    actionClass: "EXTERNAL_SEND",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      previewSupported: true,
      reason: "Posts external comment to GitHub issue/PR.",
    },
    idempotency: {
      idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
      duplicateRisk: "Repeat execution on confirmed: true posts duplicate comment.",
    },
    requirements: { requiredEnv: ["GITHUB_TOKEN"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(process.env.GITHUB_TOKEN),
        reason: process.env.GITHUB_TOKEN ? undefined : "GITHUB_TOKEN is not set",
      }),
    },
    routing: { keywords: ["github", "comment on issue", "reply to issue", "post comment"], domainHints: ["GitHub"] },
    userFacing: true,
  },
]

// ============================================================================
// 2. GOOGLE (10 capabilities: 5 Calendar, 5 Mail)
// ============================================================================

const gEventsList = fromConnectorTool((googleTools as any).getCalendarEvents)
const gEventsSearch = fromConnectorTool((googleTools as any).searchCalendarEvents)
const gEventCreate = fromConnectorTool((googleTools as any).createCalendarEvent)
const gEventUpdate = fromConnectorTool((googleTools as any).updateCalendarEvent)
const gEventDelete = fromConnectorTool((googleTools as any).deleteCalendarEvent)

const gMailList = fromConnectorTool((googleTools as any).getRecentEmails)
const gMailSearch = fromConnectorTool((googleTools as any).searchGmail)
const gMailRead = fromConnectorTool((googleTools as any).readEmail)
const gMailSend = fromConnectorTool((googleTools as any).sendGmail)
const gMailReply = fromConnectorTool((googleTools as any).replyToEmail)

export const googleCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("google.calendar.events.list"),
    legacyToolName: "getCalendarEvents",
    domain: "google",
    title: "Get Google Calendar Events",
    description: gEventsList.description,
    inputSchema: gEventsList.inputSchema,
    handler: gEventsList.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredSettings: ["google_oauth"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getGoogleSettings()) && isGoogleConnected(),
        reason: !getGoogleSettings() ? "Google not connected in Settings" : undefined,
      }),
    },
    routing: { keywords: ["calendar", "google calendar", "schedule", "meetings", "events"], domainHints: ["Google Calendar"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("google.calendar.events.search"),
    legacyToolName: "searchCalendarEvents",
    domain: "google",
    title: "Search Google Calendar Events",
    description: gEventsSearch.description,
    inputSchema: gEventsSearch.inputSchema,
    handler: gEventsSearch.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredSettings: ["google_oauth"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getGoogleSettings()) && isGoogleConnected(),
        reason: !getGoogleSettings() ? "Google not connected in Settings" : undefined,
      }),
    },
    routing: { keywords: ["search calendar", "find meeting", "lookup event"], domainHints: ["Google Calendar"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("google.calendar.event.create"),
    legacyToolName: "createCalendarEvent",
    domain: "google",
    title: "Create Google Calendar Event",
    description: gEventCreate.description,
    inputSchema: gEventCreate.inputSchema,
    handler: gEventCreate.execute,
    actionClass: "EXTERNAL_CREATE",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      reason: "Creates new event in Google Calendar. Note: V1 executes without confirmation (known issue).",
    },
    idempotency: {
      idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
      duplicateRisk: "Repeated executions create duplicate calendar events.",
    },
    requirements: { requiredSettings: ["google_oauth"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getGoogleSettings()) && isGoogleConnected(),
        reason: !getGoogleSettings() ? "Google not connected in Settings" : undefined,
      }),
    },
    routing: { keywords: ["add meeting", "schedule event", "create calendar event"], domainHints: ["Google Calendar"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("google.calendar.event.update"),
    legacyToolName: "updateCalendarEvent",
    domain: "google",
    title: "Update Google Calendar Event",
    description: gEventUpdate.description,
    inputSchema: gEventUpdate.inputSchema,
    handler: gEventUpdate.execute,
    actionClass: "EXTERNAL_UPDATE",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      previewSupported: true,
      reason: "Modifies existing Google Calendar event.",
    },
    idempotency: { idempotencyClass: "NATURALLY_IDEMPOTENT" },
    requirements: { requiredSettings: ["google_oauth"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getGoogleSettings()) && isGoogleConnected(),
        reason: !getGoogleSettings() ? "Google not connected in Settings" : undefined,
      }),
    },
    routing: { keywords: ["reschedule meeting", "update event", "move calendar event"], domainHints: ["Google Calendar"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("google.calendar.event.delete"),
    legacyToolName: "deleteCalendarEvent",
    domain: "google",
    title: "Delete Google Calendar Event",
    description: gEventDelete.description,
    inputSchema: gEventDelete.inputSchema,
    handler: gEventDelete.execute,
    actionClass: "EXTERNAL_DELETE",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      previewSupported: true,
      reason: "Permanently cancels/deletes event from Google Calendar.",
    },
    idempotency: { idempotencyClass: "NATURALLY_IDEMPOTENT" },
    requirements: { requiredSettings: ["google_oauth"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getGoogleSettings()) && isGoogleConnected(),
        reason: !getGoogleSettings() ? "Google not connected in Settings" : undefined,
      }),
    },
    routing: { keywords: ["cancel meeting", "delete event", "remove calendar event"], domainHints: ["Google Calendar"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("google.mail.messages.list"),
    legacyToolName: "getRecentEmails",
    domain: "google",
    title: "Get Recent Emails",
    description: gMailList.description,
    inputSchema: gMailList.inputSchema,
    handler: gMailList.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredSettings: ["google_oauth"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getGoogleSettings()) && isGoogleConnected(),
        reason: !getGoogleSettings() ? "Google not connected in Settings" : undefined,
      }),
    },
    routing: { keywords: ["email", "inbox", "recent emails", "gmail messages"], domainHints: ["Google Gmail"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("google.mail.messages.search"),
    legacyToolName: "searchGmail",
    domain: "google",
    title: "Search Gmail",
    description: gMailSearch.description,
    inputSchema: gMailSearch.inputSchema,
    handler: gMailSearch.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredSettings: ["google_oauth"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getGoogleSettings()) && isGoogleConnected(),
        reason: !getGoogleSettings() ? "Google not connected in Settings" : undefined,
      }),
    },
    routing: { keywords: ["search email", "find email", "from:", "subject:", "has:attachment"], domainHints: ["Google Gmail"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("google.mail.message.read"),
    legacyToolName: "readEmail",
    domain: "google",
    title: "Read Email",
    description: gMailRead.description,
    inputSchema: gMailRead.inputSchema,
    handler: gMailRead.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredSettings: ["google_oauth"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getGoogleSettings()) && isGoogleConnected(),
        reason: !getGoogleSettings() ? "Google not connected in Settings" : undefined,
      }),
    },
    routing: { keywords: ["read email", "open email", "full email body"], domainHints: ["Google Gmail"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("google.mail.message.send"),
    legacyToolName: "sendGmail",
    domain: "google",
    title: "Send Gmail",
    description: gMailSend.description,
    inputSchema: gMailSend.inputSchema,
    handler: gMailSend.execute,
    actionClass: "EXTERNAL_SEND",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "CRITICAL",
      previewSupported: true,
      reason: "Sends outbound email to recipient via user's Gmail account.",
    },
    idempotency: {
      idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
      duplicateRisk: "Repeat execution on confirmed: true transmits duplicate email.",
    },
    requirements: { requiredSettings: ["google_oauth"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getGoogleSettings()) && isGoogleConnected(),
        reason: !getGoogleSettings() ? "Google not connected in Settings" : undefined,
      }),
    },
    routing: { keywords: ["send email", "email someone", "write email", "send gmail"], domainHints: ["Google Gmail"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("google.mail.message.reply"),
    legacyToolName: "replyToEmail",
    domain: "google",
    title: "Reply to Email",
    description: gMailReply.description,
    inputSchema: gMailReply.inputSchema,
    handler: gMailReply.execute,
    actionClass: "EXTERNAL_SEND",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "CRITICAL",
      previewSupported: true,
      reason: "Sends outbound reply in existing email thread.",
    },
    idempotency: {
      idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
      duplicateRisk: "Repeat execution on confirmed: true transmits duplicate reply.",
    },
    requirements: { requiredSettings: ["google_oauth"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getGoogleSettings()) && isGoogleConnected(),
        reason: !getGoogleSettings() ? "Google not connected in Settings" : undefined,
      }),
    },
    routing: { keywords: ["reply to email", "respond to email", "email reply"], domainHints: ["Google Gmail"] },
    userFacing: true,
  },
]

// ============================================================================
// 3. APPLE (5 capabilities)
// ============================================================================

const aEventsList = fromConnectorTool((appleTools as any).getAppleCalendarEvents)
const aEventsSearch = fromConnectorTool((appleTools as any).searchAppleCalendarEvents)
const aEventCreate = fromConnectorTool((appleTools as any).createAppleCalendarEvent)
const aEventUpdate = fromConnectorTool((appleTools as any).updateAppleCalendarEvent)
const aEventDelete = fromConnectorTool((appleTools as any).deleteAppleCalendarEvent)

export const appleCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("apple.calendar.events.list"),
    legacyToolName: "getAppleCalendarEvents",
    domain: "apple",
    title: "Get Apple Calendar Events",
    description: aEventsList.description,
    inputSchema: aEventsList.inputSchema,
    handler: aEventsList.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredSettings: ["apple_caldav"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => {
        const settings = getAppleSettings()
        const ok = Boolean(settings?.appleId && settings?.appPassword)
        return { available: ok, reason: ok ? undefined : "Apple ID or app password missing" }
      },
    },
    routing: { keywords: ["apple calendar", "icloud calendar", "schedule", "events"], domainHints: ["Apple Calendar"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("apple.calendar.events.search"),
    legacyToolName: "searchAppleCalendarEvents",
    domain: "apple",
    title: "Search Apple Calendar Events",
    description: aEventsSearch.description,
    inputSchema: aEventsSearch.inputSchema,
    handler: aEventsSearch.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredSettings: ["apple_caldav"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => {
        const settings = getAppleSettings()
        const ok = Boolean(settings?.appleId && settings?.appPassword)
        return { available: ok, reason: ok ? undefined : "Apple ID or app password missing" }
      },
    },
    routing: { keywords: ["search apple calendar", "find icloud event"], domainHints: ["Apple Calendar"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("apple.calendar.event.create"),
    legacyToolName: "createAppleCalendarEvent",
    domain: "apple",
    title: "Create Apple Calendar Event",
    description: aEventCreate.description,
    inputSchema: aEventCreate.inputSchema,
    handler: aEventCreate.execute,
    actionClass: "EXTERNAL_CREATE",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      reason: "Creates event in Apple iCloud Calendar. Note: V1 executes without confirmation (known issue).",
    },
    idempotency: {
      idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
      duplicateRisk: "Repeated executions create duplicate iCloud events.",
    },
    requirements: { requiredSettings: ["apple_caldav"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => {
        const settings = getAppleSettings()
        const ok = Boolean(settings?.appleId && settings?.appPassword)
        return { available: ok, reason: ok ? undefined : "Apple ID or app password missing" }
      },
    },
    routing: { keywords: ["add icloud event", "create apple calendar event"], domainHints: ["Apple Calendar"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("apple.calendar.event.update"),
    legacyToolName: "updateAppleCalendarEvent",
    domain: "apple",
    title: "Update Apple Calendar Event",
    description: aEventUpdate.description,
    inputSchema: aEventUpdate.inputSchema,
    handler: aEventUpdate.execute,
    actionClass: "EXTERNAL_UPDATE",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      previewSupported: true,
      reason: "Modifies existing Apple Calendar event.",
    },
    idempotency: { idempotencyClass: "NATURALLY_IDEMPOTENT" },
    requirements: { requiredSettings: ["apple_caldav"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => {
        const settings = getAppleSettings()
        const ok = Boolean(settings?.appleId && settings?.appPassword)
        return { available: ok, reason: ok ? undefined : "Apple ID or app password missing" }
      },
    },
    routing: { keywords: ["reschedule apple meeting", "update icloud event"], domainHints: ["Apple Calendar"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("apple.calendar.event.delete"),
    legacyToolName: "deleteAppleCalendarEvent",
    domain: "apple",
    title: "Delete Apple Calendar Event",
    description: aEventDelete.description,
    inputSchema: aEventDelete.inputSchema,
    handler: aEventDelete.execute,
    actionClass: "EXTERNAL_DELETE",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      previewSupported: true,
      reason: "Permanently cancels/deletes event from Apple Calendar.",
    },
    idempotency: { idempotencyClass: "NATURALLY_IDEMPOTENT" },
    requirements: { requiredSettings: ["apple_caldav"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => {
        const settings = getAppleSettings()
        const ok = Boolean(settings?.appleId && settings?.appPassword)
        return { available: ok, reason: ok ? undefined : "Apple ID or app password missing" }
      },
    },
    routing: { keywords: ["cancel apple meeting", "delete icloud event"], domainHints: ["Apple Calendar"] },
    userFacing: true,
  },
]

// ============================================================================
// 4. TELEGRAM (2 capabilities)
// ============================================================================

const tgSend = fromConnectorTool((telegramTools as any).sendTelegram)
const tgGet = fromConnectorTool((telegramTools as any).getTelegramMessages)

export const telegramCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("telegram.message.send"),
    legacyToolName: "sendTelegram",
    domain: "telegram",
    title: "Send Telegram Message",
    description: tgSend.description,
    inputSchema: tgSend.inputSchema,
    handler: tgSend.execute,
    actionClass: "EXTERNAL_SEND",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      reason: "Sends outbound message via Telegram bot. Note: V1 executes without confirmation (known issue).",
    },
    idempotency: {
      idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
      duplicateRisk: "Repeat calls send duplicate Telegram messages.",
    },
    requirements: { requiredSettings: ["telegram_bot_token"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => {
        const settings = getTelegramSettings()
        const ok = Boolean(settings?.botToken)
        return { available: ok, reason: ok ? undefined : "Telegram botToken not configured" }
      },
    },
    routing: { keywords: ["telegram", "send telegram", "message to phone", "notify via telegram"], domainHints: ["Telegram"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("telegram.messages.get"),
    legacyToolName: "getTelegramMessages",
    domain: "telegram",
    title: "Get Telegram Messages",
    description: tgGet.description,
    inputSchema: tgGet.inputSchema,
    handler: tgGet.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredSettings: ["telegram_bot_token"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => {
        const settings = getTelegramSettings()
        const ok = Boolean(settings?.botToken)
        return { available: ok, reason: ok ? undefined : "Telegram botToken not configured" }
      },
    },
    routing: { keywords: ["telegram messages", "check telegram", "read telegram"], domainHints: ["Telegram"] },
    userFacing: true,
  },
]

// ============================================================================
// 5. OBSIDIAN (4 capabilities)
// ============================================================================

const obSearch = fromConnectorTool((obsidianTools as any).searchNotes)
const obRead = fromConnectorTool((obsidianTools as any).readNote)
const obAppend = fromConnectorTool((obsidianTools as any).appendNote)
const obCreate = fromConnectorTool((obsidianTools as any).createNote)

function assertSafeVaultPath(path: string): void {
  if (!path || typeof path !== "string") {
    throw new CapabilityOperationalError({
      code: "INVALID_INPUT",
      message: "Invalid note path.",
      retryHint: "DO_NOT_RETRY",
    })
  }
  const normalized = path.replace(/\\/g, "/")
  if (
    normalized.includes("../") ||
    normalized.startsWith("../") ||
    normalized.endsWith("/..") ||
    normalized === ".." ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new CapabilityOperationalError({
      code: "PERMISSION_DENIED",
      message: `Security Violation: Directory traversal detected in path "${path}". Access outside vault is forbidden.`,
      retryHint: "DO_NOT_RETRY",
      fixAction: "Use relative paths within the Obsidian vault.",
    })
  }
}

export const obsidianCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("obsidian.notes.search"),
    legacyToolName: "searchNotes",
    domain: "obsidian",
    title: "Search Obsidian Notes",
    description: obSearch.description,
    inputSchema: obSearch.inputSchema,
    handler: obSearch.execute,
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredSettings: ["obsidian_rest_api"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getObsidianSettings()),
        reason: getObsidianSettings() ? undefined : "Obsidian settings not configured",
      }),
    },
    routing: { keywords: ["obsidian", "notes", "search notes", "find note", "vault"], domainHints: ["Obsidian vault"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("obsidian.note.read"),
    legacyToolName: "readNote",
    domain: "obsidian",
    title: "Read Obsidian Note",
    description: obRead.description,
    inputSchema: obRead.inputSchema,
    handler: async ({ path }: any, context) => {
      assertSafeVaultPath(path)
      return obRead.execute({ path }, context)
    },
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { requiredSettings: ["obsidian_rest_api"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getObsidianSettings()),
        reason: getObsidianSettings() ? undefined : "Obsidian settings not configured",
      }),
    },
    routing: { keywords: ["read note", "open note", "view note", "note content"], domainHints: ["Obsidian vault"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("obsidian.note.append"),
    legacyToolName: "appendNote",
    domain: "obsidian",
    title: "Append to Obsidian Note",
    description: obAppend.description,
    inputSchema: obAppend.inputSchema,
    handler: async ({ path, content }: any, context) => {
      assertSafeVaultPath(path)
      return obAppend.execute({ path, content }, context)
    },
    actionClass: "EXTERNAL_UPDATE",
    confirmation: { defaultPolicy: "NONE", criticality: "MEDIUM" },
    idempotency: {
      idempotencyClass: "NON_IDEMPOTENT_EXTERNAL",
      duplicateRisk: "Appends duplicate text block on repeat executions.",
    },
    requirements: { requiredSettings: ["obsidian_rest_api"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getObsidianSettings()),
        reason: getObsidianSettings() ? undefined : "Obsidian settings not configured",
      }),
    },
    routing: { keywords: ["append note", "add to note", "append to document"], domainHints: ["Obsidian vault"] },
    userFacing: true,
  },
  {
    id: asCapabilityId("obsidian.note.create"),
    legacyToolName: "createNote",
    domain: "obsidian",
    title: "Create Obsidian Note",
    description: obCreate.description,
    inputSchema: obCreate.inputSchema,
    handler: async ({ path, content }: any, context) => {
      assertSafeVaultPath(path)
      return obCreate.execute({ path, content }, context)
    },
    actionClass: "EXTERNAL_CREATE",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      reason: "Creates or silently overwrites existing file in vault. Note: V1 overwrites without confirmation (known issue).",
    },
    idempotency: {
      idempotencyClass: "NATURALLY_IDEMPOTENT",
      duplicateRisk: "Blind overwrite of existing note content on collision.",
    },
    requirements: { requiredSettings: ["obsidian_rest_api"] },
    availability: {
      staticState: "REQUIRES_AUTH",
      isLocallyConfigured: () => ({
        available: Boolean(getObsidianSettings()),
        reason: getObsidianSettings() ? undefined : "Obsidian settings not configured",
      }),
    },
    routing: { keywords: ["create note", "new note", "write note", "save note"], domainHints: ["Obsidian vault"] },
    userFacing: true,
  },
]

// Aggregate all 27 connector capabilities
export const CONNECTOR_CAPABILITIES: ReadonlyArray<CapabilityDefinition> = [
  ...githubCapabilities,
  ...googleCapabilities,
  ...appleCapabilities,
  ...telegramCapabilities,
  ...obsidianCapabilities,
]
