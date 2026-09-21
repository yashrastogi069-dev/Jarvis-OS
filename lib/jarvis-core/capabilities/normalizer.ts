/**
 * JARVIS CORE V2 — ERROR NORMALIZATION & SECRET SANITIZATION
 * 
 * Checkpoint: C3 (Sections 6, 7, 8, 14, 15, 17)
 * Status: Authoritative Error Normalization Engine
 * 
 * Responsibilities:
 * 1. Sanitizes credentials and sensitive tokens from all user-facing error text.
 * 2. Classifies thrown exceptions into semantic CapabilityErrorCode taxonomy.
 * 3. Enforces context-aware RetryHint semantics based on ActionClass.
 * 4. Preserves UNKNOWN_COMMIT distinction for uncertain external mutations.
 * 5. Prevents raw unhandled stack traces from reaching the AI agent or UI.
 */

import { ZodError } from "zod"
import type { ActionClass } from "../types"
import type { CapabilityError, CapabilityErrorCode, RetryHint } from "./result"
import { CapabilityOperationalError } from "./result"
import { toJsonValue } from "./json"

// ============================================================================
// 1. SECRET SANITIZATION (Section 17)
// ============================================================================

/**
 * Remove sensitive tokens, keys, authorization headers, and credentials from text.
 */
export function sanitizeSecrets(text: string): string {
  if (!text) return ""

  let sanitized = text
    // Authorization header tokens
    .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]{10,}/gi, "Bearer [REDACTED]")
    // GitHub PAT tokens
    .replace(/(?:ghp_|github_pat_)[A-Za-z0-9_]{15,}/g, "[REDACTED_GITHUB_TOKEN]")
    // Google API keys
    .replace(/AIzaSy[A-Za-z0-9_-]{25,}/g, "[REDACTED_GOOGLE_KEY]")
    // Slack tokens
    .replace(/xox[baprs]-[A-Za-z0-9-]+/g, "[REDACTED_SLACK_TOKEN]")
    // Telegram bot tokens
    .replace(/bot[0-9]{8,10}:[A-Za-z0-9_-]{30,}/g, "[REDACTED_TELEGRAM_TOKEN]")
    // Key/password assignment patterns
    .replace(
      /(password|secret|key|api_key|app_password|refresh_token|access_token)=([^\s&"',;]+)/gi,
      "$1=[REDACTED]",
    )

  // Dynamically redact known environment variables if defined and >= 8 chars
  const sensitiveEnvKeys = [
    "GITHUB_TOKEN",
    "GOOGLE_CLIENT_SECRET",
    "TAVILY_API_KEY",
    "SERPER_API_KEY",
    "FIRECRAWL_API_KEY",
    "TELEGRAM_BOT_TOKEN",
  ]
  for (const envKey of sensitiveEnvKeys) {
    const val = process.env[envKey]
    if (val && val.length >= 8 && sanitized.includes(val)) {
      sanitized = sanitized.replaceAll(val, `[REDACTED_${envKey}]`)
    }
  }

  return sanitized
}

// ============================================================================
// 2. RETRY HINT LOGIC (Section 7 & 8)
// ============================================================================

function isExternalMutation(actionClass?: ActionClass): boolean {
  return Boolean(
    actionClass === "EXTERNAL_CREATE" ||
      actionClass === "EXTERNAL_UPDATE" ||
      actionClass === "EXTERNAL_DELETE" ||
      actionClass === "EXTERNAL_SEND",
  )
}

function resolveRetryHint(code: CapabilityErrorCode, actionClass?: ActionClass): RetryHint {
  // 1. Permanent / Non-retryable conditions
  if (
    code === "INVALID_INPUT" ||
    code === "UNCONFIGURED" ||
    code === "AUTH_REQUIRED" ||
    code === "PERMISSION_DENIED" ||
    code === "CANCELLED" ||
    code === "ALREADY_EXISTS" ||
    code === "INTERNAL_ERROR"
  ) {
    return "DO_NOT_RETRY"
  }

  // 2. Uncertain commit on external mutation MUST require policy review
  if (code === "UNKNOWN_COMMIT") {
    return "REQUIRES_POLICY"
  }

  // 3. Read-only actions can safely retry transient transport/rate errors
  if (actionClass === "READ_ONLY") {
    if (
      code === "RATE_LIMITED" ||
      code === "TIMEOUT" ||
      code === "NETWORK_ERROR" ||
      code === "SERVICE_UNAVAILABLE"
    ) {
      return "SAFE_TO_RETRY"
    }
    return "DO_NOT_RETRY"
  }

  // 4. Local or external mutations with transient transport errors
  if (isExternalMutation(actionClass)) {
    return "REQUIRES_POLICY"
  }

  if (code === "RATE_LIMITED") {
    return "SAFE_TO_RETRY"
  }

  return "REQUIRES_POLICY"
}

// ============================================================================
// 3. ERROR NORMALIZATION PIPELINE (Section 14 & 15)
// ============================================================================

/**
 * Normalizes any caught runtime error, thrown exception, or error string
 * into a typed, sanitized CapabilityError envelope.
 */
export function normalizeError(thrown: unknown, actionClass?: ActionClass): CapabilityError {
  // 1. Already a CapabilityOperationalError
  if (thrown instanceof CapabilityOperationalError) {
    return {
      code: thrown.code,
      message: sanitizeSecrets(thrown.message),
      retryHint: thrown.retryHint,
      fixAction: thrown.fixAction,
      details: thrown.details,
    }
  }

  // 2. Zod Schema Validation Error
  if (thrown instanceof ZodError) {
    const issueSummary = thrown.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ")
    return {
      code: "INVALID_INPUT",
      message: sanitizeSecrets(`Input validation failed: ${issueSummary}`),
      retryHint: "DO_NOT_RETRY",
      fixAction: "Check tool input schema and provide valid parameters.",
      details: { issues: thrown.issues as any },
    }
  }

  // Extract raw error string and inspectable object
  const isErrObj = typeof thrown === "object" && thrown !== null
  const errObj = isErrObj ? (thrown as Record<string, unknown>) : {}
  const rawMessage = thrown instanceof Error ? thrown.message : String(thrown)
  const cleanMsg = sanitizeSecrets(rawMessage)

  // 3. HTTP Status Codes / Structured API Responses
  const statusCode =
    typeof errObj.status === "number"
      ? errObj.status
      : typeof errObj.statusCode === "number"
        ? errObj.statusCode
        : parseHttpCodeFromMessage(rawMessage)

  if (statusCode) {
    if (statusCode === 400) {
      return {
        code: "INVALID_INPUT",
        message: cleanMsg || "Bad request / invalid input.",
        retryHint: "DO_NOT_RETRY",
      }
    }
    if (statusCode === 401) {
      return {
        code: "AUTH_REQUIRED",
        message: cleanMsg || "Authentication required.",
        retryHint: "DO_NOT_RETRY",
        fixAction: "Reconnect authentication in Settings.",
      }
    }
    if (statusCode === 403) {
      return {
        code: "PERMISSION_DENIED",
        message: cleanMsg || "Permission denied.",
        retryHint: "DO_NOT_RETRY",
        fixAction: "Check account permissions and scopes.",
      }
    }
    if (statusCode === 404) {
      return {
        code: "NOT_FOUND",
        message: cleanMsg || "Target resource not found.",
        retryHint: "DO_NOT_RETRY",
      }
    }
    if (statusCode === 409) {
      return {
        code: "CONFLICT",
        message: cleanMsg || "Resource conflict.",
        retryHint: "DO_NOT_RETRY",
      }
    }
    if (statusCode === 429) {
      return {
        code: "RATE_LIMITED",
        message: cleanMsg || "Rate limit exceeded. Please try again later.",
        retryHint: resolveRetryHint("RATE_LIMITED", actionClass),
      }
    }
    if (statusCode >= 500 && statusCode < 600) {
      // If external mutation failed with 5xx, state might be uncertain
      const code: CapabilityErrorCode = isExternalMutation(actionClass)
        ? "UNKNOWN_COMMIT"
        : "SERVICE_UNAVAILABLE"
      return {
        code,
        message:
          code === "UNKNOWN_COMMIT"
            ? "Remote service error during external mutation. Side effect outcome is unverified."
            : cleanMsg || "Remote service is temporarily unavailable.",
        retryHint: resolveRetryHint(code, actionClass),
      }
    }
  }

  // 4. Database Errors (SQLite Unique Constraints, etc.)
  if (cleanMsg.includes("UNIQUE constraint failed") || cleanMsg.includes("already exists")) {
    return {
      code: "ALREADY_EXISTS",
      message: cleanMsg,
      retryHint: "DO_NOT_RETRY",
      fixAction: "Entity already exists. Use update or list instead.",
    }
  }

  // 5. Abort, Timeout & Mutation Uncertainty (Section 8)
  const isAbortOrTimeout =
    errObj.name === "AbortError" ||
    errObj.name === "TimeoutError" ||
    cleanMsg.toLowerCase().includes("timed out") ||
    cleanMsg.toLowerCase().includes("timeout")

  if (isAbortOrTimeout) {
    if (isExternalMutation(actionClass)) {
      return {
        code: "UNKNOWN_COMMIT",
        message:
          "Remote mutation request timed out before confirmation was received. State on remote system is unverified; verify before replay.",
        retryHint: "REQUIRES_POLICY",
      }
    }
    return {
      code: "TIMEOUT",
      message: "Operation timed out.",
      retryHint: resolveRetryHint("TIMEOUT", actionClass),
    }
  }

  // 6. Network & Transport Errors
  const isNetworkFailure =
    cleanMsg.includes("fetch failed") ||
    cleanMsg.includes("ECONNREFUSED") ||
    cleanMsg.includes("ENOTFOUND") ||
    cleanMsg.includes("ECONNRESET") ||
    cleanMsg.includes("UND_ERR_CONNECT_TIMEOUT")

  if (isNetworkFailure) {
    if (isExternalMutation(actionClass)) {
      return {
        code: "UNKNOWN_COMMIT",
        message:
          "Network connection failed during external mutation. Mutation status on remote service is unverified.",
        retryHint: "REQUIRES_POLICY",
      }
    }
    return {
      code: "NETWORK_ERROR",
      message: "Network communication failure. Please check connectivity.",
      retryHint: resolveRetryHint("NETWORK_ERROR", actionClass),
    }
  }

  // 7. Domain / Connector Legacy Error Messages
  if (
    cleanMsg.includes("GITHUB_TOKEN is not set") ||
    cleanMsg.includes("FIRECRAWL_API_KEY not set") ||
    cleanMsg.includes("TAVILY_API_KEY not set") ||
    cleanMsg.includes("SERPER_API_KEY not set") ||
    cleanMsg.includes("not configured in Settings")
  ) {
    return {
      code: "UNCONFIGURED",
      message: cleanMsg,
      retryHint: "DO_NOT_RETRY",
      fixAction: "Configure required API keys or environment variables in .env.local or Settings.",
    }
  }

  if (cleanMsg.includes("Obsidian is not configured")) {
    return {
      code: "UNCONFIGURED",
      message: "Obsidian connector is unconfigured: Local REST API plugin credentials missing.",
      retryHint: "DO_NOT_RETRY",
      fixAction: "Configure Obsidian in Settings with your API key.",
    }
  }

  if (cleanMsg.includes("is not connected") || cleanMsg.includes("Complete the OAuth flow")) {
    return {
      code: "AUTH_REQUIRED",
      message: cleanMsg,
      retryHint: "DO_NOT_RETRY",
      fixAction: "Complete the OAuth connection in Settings.",
    }
  }

  if (cleanMsg.includes("token refresh failed")) {
    return {
      code: "AUTH_REQUIRED",
      message: "OAuth refresh failed: session expired or token revoked.",
      retryHint: "DO_NOT_RETRY",
      fixAction: "Reconnect your account in Settings.",
    }
  }

  if (cleanMsg.includes("Apple ID") || cleanMsg.includes("CalDAV PROPFIND") || cleanMsg.includes("Apple Calendar is not configured")) {
    return {
      code: "UNCONFIGURED",
      message: "Apple iCloud Calendar connection failed or credentials invalid.",
      retryHint: "DO_NOT_RETRY",
      fixAction: "Configure your Apple ID and App-Specific Password in Settings.",
    }
  }

  if (cleanMsg.includes("Telegram is not configured")) {
    return {
      code: "UNCONFIGURED",
      message: "Telegram connector is unconfigured: botToken is missing.",
      retryHint: "DO_NOT_RETRY",
      fixAction: "Add your Telegram bot token in Settings.",
    }
  }

  if (cleanMsg.includes("Task") && cleanMsg.includes("not found")) {
    return {
      code: "NOT_FOUND",
      message: cleanMsg,
      retryHint: "DO_NOT_RETRY",
      fixAction: "Verify the task ID using listTasks.",
    }
  }

  if (cleanMsg.includes("Skill not found")) {
    return {
      code: "NOT_FOUND",
      message: cleanMsg,
      retryHint: "DO_NOT_RETRY",
      fixAction: "Verify the skill name or ID using listSkills.",
    }
  }

  if (cleanMsg.includes("No wake word with id")) {
    return {
      code: "NOT_FOUND",
      message: cleanMsg,
      retryHint: "DO_NOT_RETRY",
      fixAction: "Verify the wake word ID using listWakeWords.",
    }
  }

  if (cleanMsg.includes("Note not found") || cleanMsg.includes("Memory not found") || cleanMsg.includes("not found")) {
    return {
      code: "NOT_FOUND",
      message: cleanMsg,
      retryHint: "DO_NOT_RETRY",
    }
  }

  // 8. Unexpected Programming Defect / Fallback
  return {
    code: "INTERNAL_ERROR",
    message: cleanMsg || "An internal error occurred during capability execution.",
    retryHint: "DO_NOT_RETRY",
  }
}

/**
 * Extract HTTP status code from error message strings (e.g. "GitHub API POST failed: 404").
 */
function parseHttpCodeFromMessage(msg: string): number | undefined {
  const match = msg.match(/(?:status|code|failed)\s*[:(]?\s*([45]\d{2})\b/i)
  if (match && match[1]) {
    const parsed = parseInt(match[1], 10)
    if (!isNaN(parsed)) return parsed
  }
  return undefined
}

// ============================================================================
// 3. CANONICAL INPUT NORMALIZATION (Repair Gate B)
// ============================================================================

export interface NormalizedInputSuccess {
  readonly success: true
  readonly canonicalArgs: Record<string, any>
}

export interface NormalizedInputFailure {
  readonly success: false
  readonly error: {
    readonly code: "INVALID_INPUT"
    readonly message: string
    readonly details?: unknown
  }
}

export type NormalizedInputResult = NormalizedInputSuccess | NormalizedInputFailure

/**
 * Deterministically validate, coerce, and serialize capability input arguments
 * against the capability's Zod schema into a single canonical JSON-safe representation.
 * 
 * Ensures preview arguments === ledger-hashed arguments === handler arguments.
 */
export function normalizeCapabilityInput(
  capability: { readonly id: string; readonly inputSchema?: unknown },
  rawInput: unknown
): NormalizedInputResult {
  const schema = capability.inputSchema as { safeParse?: (input: unknown) => { success: boolean; data?: any; error?: ZodError } } | undefined

  if (schema && typeof schema.safeParse === "function") {
    const rawObj = (typeof rawInput === "object" && rawInput !== null)
      ? { ...(rawInput as Record<string, unknown>) }
      : {}

    // Pre-normalize common capability input aliases
    // Calendar aliases: title -> summary, startTime/startDate -> startISO, endTime/endDate -> endISO
    if (capability.id.includes("calendar")) {
      if ("title" in rawObj && !("summary" in rawObj)) {
        rawObj.summary = rawObj.title
      }
      if ("startTime" in rawObj && !("startISO" in rawObj)) {
        rawObj.startISO = rawObj.startTime
      }
      if ("startDate" in rawObj && !("startISO" in rawObj)) {
        rawObj.startISO = rawObj.startDate
      }
      if ("endTime" in rawObj && !("endISO" in rawObj)) {
        rawObj.endISO = rawObj.endTime
      }
      if ("endDate" in rawObj && !("endISO" in rawObj)) {
        rawObj.endISO = rawObj.endDate
      }
    }

    // GitHub aliases: owner + repo -> owner/repo, issue_number -> issueNumber
    if (capability.id.startsWith("github.")) {
      if ("owner" in rawObj && "repo" in rawObj && typeof rawObj.repo === "string" && !rawObj.repo.includes("/")) {
        rawObj.repo = `${rawObj.owner}/${rawObj.repo}`
        delete rawObj.owner
      }
      if ("issue_number" in rawObj && !("issueNumber" in rawObj)) {
        rawObj.issueNumber = rawObj.issue_number
        delete rawObj.issue_number
      }
    }

    // Task / Memory / Wake Word aliases: task_id/taskId -> id, etc.
    if ("task_id" in rawObj && !("id" in rawObj)) rawObj.id = rawObj.task_id
    if ("taskId" in rawObj && !("id" in rawObj)) rawObj.id = rawObj.taskId
    if ("memory_id" in rawObj && !("id" in rawObj)) rawObj.id = rawObj.memory_id
    if ("memoryId" in rawObj && !("id" in rawObj)) rawObj.id = rawObj.memoryId
    if ("wake_word_id" in rawObj && !("id" in rawObj)) rawObj.id = rawObj.wake_word_id
    if ("wakeWordId" in rawObj && !("id" in rawObj)) rawObj.id = rawObj.wakeWordId

    let parseResult = schema.safeParse(rawObj)
    if (!parseResult.success && rawObj.confirmed === undefined) {
      const retryWithConfirmed = schema.safeParse({ ...rawObj, confirmed: false })
      if (retryWithConfirmed.success) {
        rawObj.confirmed = false
        parseResult = retryWithConfirmed
      }
    }

    if (!parseResult.success && parseResult.error) {
      const issueSummary = parseResult.error.issues
        .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
        .join("; ")
      return {
        success: false,
        error: {
          code: "INVALID_INPUT",
          message: sanitizeSecrets(`Input validation failed for ${capability.id}: ${issueSummary}`),
          details: parseResult.error.format(),
        },
      }
    }

    try {
      const safeData = toJsonValue(parseResult.data ?? {}) as Record<string, any>
      return {
        success: true,
        canonicalArgs: typeof safeData === "object" && safeData !== null && !Array.isArray(safeData) ? safeData : { value: safeData },
      }
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: "INVALID_INPUT",
          message: `Failed to serialize input for ${capability.id}: ${err?.message ?? "Circular reference"}`,
        },
      }
    }
  }

  // Fallback if capability has no Zod schema
  try {
    const safeData = toJsonValue(rawInput ?? {}) as Record<string, any>
    return {
      success: true,
      canonicalArgs: typeof safeData === "object" && safeData !== null && !Array.isArray(safeData) ? safeData : {},
    }
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: `Failed to serialize input for ${capability.id}: ${err?.message ?? "Circular reference"}`,
      },
    }
  }
}

