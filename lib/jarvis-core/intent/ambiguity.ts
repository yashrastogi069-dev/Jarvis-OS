/**
 * JARVIS CORE V2 — AMBIGUITY DETECTOR
 * 
 * Checkpoint: C6 (Section C6.5)
 * Status: Authoritative Ambiguity & Clarification Engine
 * 
 * Invariants:
 * 1. Zero Ambiguous Destructive Execution: Unspecified destructive actions
 *    (e.g. "delete task", "delete that") MUST NEVER execute without clarification.
 * 2. Communication Incomplete Defense: External messages with missing recipients
 *    or bodies trigger MISSING_REQUIRED_FIELD.
 * 3. Contextual Pronoun Resolution: Unresolved pronouns ("it", "that") on mutations
 *    demand explicit user disambiguation.
 */

import type { ClarificationRequest, IntentClassifierContext } from "./types"

export class AmbiguityDetector {
  /**
   * Check if a prompt contains ambiguous or underspecified requests that demand clarification.
   */
  public detect(text: string, context?: IntentClassifierContext): ClarificationRequest | null {
    const trimmed = text.trim()
    const lower = trimmed.toLowerCase()

    // 1. Destructive Task Deletion Ambiguity
    // Matches: "delete task", "remove task", "cancel task", "delete the task", "delete that task", "delete that", "delete it", "drop the task", "remove it from my list"
    if (
      /\b(delete|remove|cancel|drop|erase)\s+(the\s+|that\s+|this\s+)?(task|todo|reminder|item|entry)\b/i.test(lower) ||
      /\bremove\s+(it|that|this)\s+from\s+(my\s+)?(list|tasks|todos)\b/i.test(lower) ||
      /^(delete|remove|erase|drop)\s+(it|that|this)$/i.test(lower)
    ) {
      // Check if a specific ID or unambiguous title is provided (e.g., "delete task #5" or "delete task 12")
      const hasExplicitId = /\b(task\s+)?#?(\d+)\b/i.test(lower.replace(/\b(delete|remove|cancel|drop|erase)\s+(task|todo|item|entry)?\b/gi, ""))
      const hasSpecificQuotedTitle = /"([^"]+)"|'([^']+)'/.test(trimmed)

      if (!hasExplicitId && !hasSpecificQuotedTitle && !context?.activeTaskId) {
        return {
          ambiguityType: "AMBIGUOUS_TARGET",
          targetDomain: "tasks",
          intendedAction: "tasks.delete",
          reason: "Target task identifier or title is missing or ambiguous.",
          prompt: "Which task would you like me to delete? Please specify the task ID or exact title.",
          missingFields: ["id"],
        }
      }
    }

    // 2. Destructive Memory Deletion Ambiguity
    // Matches: "delete memory", "remove memory", "forget that", "clear memory", "erase that memory"
    if (
      /\b(delete|remove|forget|clear|erase)\s+(the\s+|that\s+|this\s+)?(memory|memories)\b/i.test(lower) ||
      /^forget\s+(about\s+)?(that|it|this)$/i.test(lower) ||
      /^(erase|clear)\s+(that|it|this)(\s+memory)?/i.test(lower)
    ) {
      const hasExplicitId = /\b(memory\s+)?#?(\d+)\b/i.test(lower.replace(/\b(delete|remove|forget|erase|clear)\s+(memory)?\b/gi, ""))
      const hasSpecificTopic = /"([^"]+)"|'([^']+)'/.test(trimmed)

      if (!hasExplicitId && !hasSpecificTopic) {
        return {
          ambiguityType: "AMBIGUOUS_TARGET",
          targetDomain: "memory",
          intendedAction: "memory.delete",
          reason: "Target memory identifier or topic is missing.",
          prompt: "Which memory record would you like me to delete? Please provide the memory ID or search topic.",
          missingFields: ["id"],
        }
      }
    }

    // 3. Destructive Calendar Event Deletion Ambiguity
    if (/\b(delete|cancel|remove)\s+(the\s+)?(meeting|event|calendar event|appointment)\b/i.test(lower)) {
      const hasSpecificEvent = /"([^"]+)"|'([^']+)'|\b#?\d{2,}\b/.test(trimmed)
      if (!hasSpecificEvent) {
        return {
          ambiguityType: "AMBIGUOUS_TARGET",
          targetDomain: "google",
          intendedAction: "google.calendar.event.delete",
          reason: "Target calendar event identifier or title is missing.",
          prompt: "Which calendar event or meeting would you like me to delete? Please specify the title or event ID.",
          missingFields: ["eventId"],
        }
      }
    }

    // 4. External Email Send Ambiguity
    if (
      /\b(send|draft|write)\s+(an?\s+)?(email|mail|gmail)\b/i.test(lower) ||
      /\bemail\s+(him|her|them|someone)\b/i.test(lower)
    ) {
      // Check if an email address or recipient is specified
      const hasEmailAddress = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)
      const hasRecipientName = /\bto\s+([a-zA-Z0-9_.-]+)/i.test(lower)

      if (!hasEmailAddress && !hasRecipientName) {
        return {
          ambiguityType: "MISSING_REQUIRED_FIELD",
          targetDomain: "google",
          intendedAction: "google.mail.message.send",
          reason: "Recipient email address or destination is missing.",
          prompt: "Who should I send the email to? Please provide a recipient email address.",
          missingFields: ["to"],
        }
      }
    }

    // 5. Telegram Message Ambiguity
    if (/\b(send|dispatch)\s+(a\s+)?(telegram|telegram message)\b/i.test(lower)) {
      // Check if message text is provided after "saying", ":", "that", etc.
      const hasContent = /:\s*.+|\bsaying\s+.+|\btext\s+['"].+['"]/i.test(trimmed)
      if (!hasContent && trimmed.split(/\s+/).length <= 4) {
        return {
          ambiguityType: "MISSING_REQUIRED_FIELD",
          targetDomain: "telegram",
          intendedAction: "telegram.message.send",
          reason: "Telegram message content is missing.",
          prompt: "What message would you like me to send on Telegram?",
          missingFields: ["text"],
        }
      }
    }

    // 6. Generic Vague Pronoun Mutation Ambiguity
    if (/^(complete|finish|snooze|update)\s+(it|that|this)$/i.test(lower)) {
      if (!context?.activeTaskId) {
        return {
          ambiguityType: "AMBIGUOUS_TARGET",
          targetDomain: "tasks",
          reason: "Pronoun reference has no active target entity in conversational context.",
          prompt: "Which task or item are you referring to? Please provide the name or ID.",
          missingFields: ["id"],
        }
      }
    }

    return null
  }
}

export const ambiguityDetector = new AmbiguityDetector()
