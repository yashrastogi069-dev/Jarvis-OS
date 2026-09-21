/**
 * JARVIS CORE V2 — DETERMINISTIC ACTION PREVIEW GENERATOR
 * 
 * Checkpoint: C4 (Section C4.12)
 * Status: Authoritative Deterministic Action Preview Engine
 * 
 * Invariants:
 * 1. Zero LLM Preview Generation: Previews are computed deterministically from validated arguments.
 * 2. Bounded Preview Size: Text snippets and body excerpts are strictly capped (max 200 chars).
 * 3. Domain Specific: Explicit human-readable summaries and danger warnings for all destructive
 *    and external capabilities.
 */

import type { CapabilityDefinition } from "../capabilities/types"
import type { ActionPreview } from "./types"

function truncate(text: unknown, maxLen = 150): string {
  if (typeof text !== "string") return String(text ?? "")
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= maxLen) return clean
  return `${clean.slice(0, maxLen)}...`
}

function generateBasePreview(
  capability: CapabilityDefinition,
  validatedArgs: Record<string, any>,
): Omit<ActionPreview, "capabilityId"> {
  const capId = capability.id
  const domain = capability.domain

  // 1. Task Delete
  if (capId === "tasks.delete") {
    return {
      targetDomain: "tasks",
      summary: `Delete task #${validatedArgs.id}`,
      details: { taskId: validatedArgs.id },
      warning: "This action will permanently delete the task from the local database.",
    }
  }

  // 2. Memory Delete
  if (capId === "memory.delete") {
    return {
      targetDomain: "memory",
      summary: `Delete memory #${validatedArgs.id}`,
      details: { memoryId: validatedArgs.id },
      warning: "This memory vector and record will be permanently deleted.",
    }
  }

  // 3. Wake Word Remove
  if (capId === "wake_words.remove") {
    return {
      targetDomain: "wake_words",
      summary: `Remove wake word #${validatedArgs.id}`,
      details: { wakeWordId: validatedArgs.id },
      warning: "Jarvis will no longer respond to this wake phrase.",
    }
  }

  // 4. Google Mail Send / Reply
  if (capId === "google.mail.message.send") {
    return {
      targetDomain: "google",
      summary: `Send email to ${validatedArgs.to}`,
      details: {
        to: validatedArgs.to,
        subject: validatedArgs.subject ?? "(no subject)",
        bodyPreview: truncate(validatedArgs.body, 150),
      },
      warning: "This email will be dispatched to an external recipient.",
    }
  }

  if (capId === "google.mail.message.reply") {
    const replyingTo = validatedArgs.id ?? validatedArgs.threadId ?? validatedArgs.messageId ?? ""
    return {
      targetDomain: "google",
      summary: `Reply to email ${replyingTo}`,
      details: {
        replyingTo,
        to: validatedArgs.to ?? "(original sender)",
        bodyPreview: truncate(validatedArgs.body, 150),
      },
      warning: "This reply will be sent to the email thread.",
    }
  }

  // 5. Telegram Message Send
  if (capId === "telegram.message.send") {
    return {
      targetDomain: "telegram",
      summary: `Send Telegram message`,
      details: {
        textPreview: truncate(validatedArgs.text, 150),
      },
      warning: "This message will be dispatched via Telegram bot.",
    }
  }

  // 6. GitHub Issue Create / Comment
  if (capId === "github.issue.create") {
    const repo = validatedArgs.repo ?? (validatedArgs.owner ? `${validatedArgs.owner}/${validatedArgs.repo ?? ""}` : "")
    return {
      targetDomain: "github",
      summary: `Create GitHub issue in ${repo}`,
      details: {
        repository: repo,
        title: validatedArgs.title ?? "",
        bodyPreview: truncate(validatedArgs.body, 150),
      },
      warning: "This issue will be created publicly or in your configured repository.",
    }
  }

  if (capId === "github.issue.comment") {
    const repo = validatedArgs.repo ?? (validatedArgs.owner ? `${validatedArgs.owner}/${validatedArgs.repo ?? ""}` : "")
    const issueNumber = validatedArgs.issueNumber ?? validatedArgs.issue_number
    return {
      targetDomain: "github",
      summary: `Comment on GitHub issue #${issueNumber} in ${repo}`,
      details: {
        repository: repo,
        issueNumber,
        commentPreview: truncate(validatedArgs.body, 150),
      },
      warning: "This comment will be published to the GitHub issue.",
    }
  }

  // 7. Google Calendar Create / Update / Delete
  if (capId === "google.calendar.event.create") {
    const start = validatedArgs.startISO ?? validatedArgs.startTime ?? ""
    const end = validatedArgs.endISO ?? validatedArgs.endTime ?? ""
    return {
      targetDomain: "google",
      summary: `Create calendar event "${validatedArgs.summary ?? ""}"`,
      details: {
        title: validatedArgs.summary ?? "",
        start,
        end,
        location: validatedArgs.location ?? null,
      },
    }
  }

  if (capId === "google.calendar.event.update") {
    return {
      targetDomain: "google",
      summary: `Update calendar event ${validatedArgs.eventId}`,
      details: {
        eventId: validatedArgs.eventId,
        title: validatedArgs.summary ?? "(unchanged)",
        start: validatedArgs.startISO ?? "(unchanged)",
        end: validatedArgs.endISO ?? "(unchanged)",
        location: validatedArgs.location ?? null,
      },
    }
  }

  if (capId === "google.calendar.event.delete") {
    return {
      targetDomain: "google",
      summary: `Delete calendar event ${validatedArgs.eventId}`,
      details: { eventId: validatedArgs.eventId },
      warning: "This event will be deleted from your Google Calendar.",
    }
  }

  // 8. Apple Calendar Create / Update / Delete
  if (capId === "apple.calendar.event.create") {
    const summary = validatedArgs.summary ?? validatedArgs.title ?? ""
    const start = validatedArgs.startISO ?? validatedArgs.startDate ?? ""
    const end = validatedArgs.endISO ?? validatedArgs.endDate ?? ""
    return {
      targetDomain: "apple",
      summary: `Create Apple Calendar event "${summary}"`,
      details: {
        title: summary,
        start,
        end,
        location: validatedArgs.location ?? null,
      },
    }
  }

  if (capId === "apple.calendar.event.update") {
    const uid = validatedArgs.uid ?? validatedArgs.eventId ?? ""
    return {
      targetDomain: "apple",
      summary: `Update Apple Calendar event ${uid}`,
      details: {
        uid,
        title: validatedArgs.summary ?? validatedArgs.title ?? "(unchanged)",
        start: validatedArgs.startISO ?? "(unchanged)",
        end: validatedArgs.endISO ?? "(unchanged)",
        location: validatedArgs.location ?? null,
      },
    }
  }

  if (capId === "apple.calendar.event.delete") {
    const uid = validatedArgs.uid ?? validatedArgs.eventId ?? ""
    return {
      targetDomain: "apple",
      summary: `Delete Apple Calendar event ${uid}`,
      details: { uid },
      warning: "This event will be deleted from your Apple iCloud Calendar.",
    }
  }

  // 9. Obsidian Create / Append
  if (capId === "obsidian.note.create") {
    return {
      targetDomain: "obsidian",
      summary: `Create note "${validatedArgs.path}"`,
      details: {
        path: validatedArgs.path,
        contentPreview: truncate(validatedArgs.content, 150),
      },
      warning: "If a note exists at this path, its contents will be replaced.",
    }
  }

  if (capId === "obsidian.note.append") {
    return {
      targetDomain: "obsidian",
      summary: `Append to note "${validatedArgs.path}"`,
      details: {
        path: validatedArgs.path,
        contentPreview: truncate(validatedArgs.content, 150),
      },
    }
  }

  // 10. Skills Run (SYSTEM_ACTION)
  if (capId === "skills.run") {
    return {
      targetDomain: "skills",
      summary: `Execute skill "${validatedArgs.name}"`,
      details: {
        skillName: validatedArgs.name,
        inputPreview: truncate(JSON.stringify(validatedArgs.input ?? {}), 150),
      },
      warning: "Running this skill will execute its defined steps.",
    }
  }

  // Generic fallback for any other capability
  const details: Record<string, string | number | boolean | null> = {}
  for (const [key, val] of Object.entries(validatedArgs)) {
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean" || val === null) {
      details[key] = typeof val === "string" ? truncate(val, 100) : val
    }
  }

  return {
    targetDomain: domain,
    summary: `${capability.title}: execute with ${Object.keys(validatedArgs).length} parameters`,
    details,
  }
}

/**
 * Generate a structured, human-readable action preview for confirmation.
 */
export function generateActionPreview(
  capability: CapabilityDefinition,
  validatedArgs: Record<string, any>,
): ActionPreview {
  const base = generateBasePreview(capability, validatedArgs)
  return {
    capabilityId: capability.id,
    ...base,
  }
}
