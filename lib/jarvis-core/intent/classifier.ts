/**
 * JARVIS CORE V2 — DETERMINISTIC FAST-PATH INTENT CLASSIFIER
 * 
 * Checkpoint: C6 (Section C6.3)
 * Status: Authoritative Zero-LLM Fast-Path Classifier
 * 
 * Invariants:
 * 1. Sub-5ms Latency: Uses pre-compiled regexes and token parsing (p50 < 1ms, p99 < 3ms).
 * 2. High Precision on Fast-Paths: Obvious CHAT, READ, ACTION, and QUEST prompts are resolved
 *    with confidence >= 0.90 without incurring LLM token cost or latency.
 * 3. Multi-Step Detection: Connectors ("and then", "after that") and dual actions route to QUEST.
 */

import type { CapabilityId } from "../types"
import type { ResolvedIntent } from "./types"

export class DeterministicFastPathClassifier {
  /**
   * Fast-path classify a user prompt. Returns ResolvedIntent if high-confidence match, or null.
   */
  public classify(text: string): ResolvedIntent | null {
    const trimmed = text.trim()
    if (!trimmed) {
      return {
        needsClarification: false,
        mode: "CHAT",
        category: "CHAT",
        intentKind: "CONVERSATION",
        confidence: 0.99,
        reason: "Empty input classified as conversational.",
        fastPath: true,
      }
    }

    const lower = trimmed.toLowerCase()

    // ========================================================================
    // 1. QUEST (Composite / Multi-Step Intent)
    // ========================================================================
    // Check for explicit sequential connectors or multi-goal composition
    if (
      /\b(and\s+then|after\s+that|first\b.+\bthen\b|once\s+done\b|next,\s+|subsequently)\b/i.test(lower) ||
      /\b(search|look\s+up|find)\b.+\band\s+(give\s+me|summarize|tell\s+me|save|send|email|create)\b/i.test(lower) ||
      /\b(create|add)\s+(a\s+)?task\b.+\band\s+(then\s+)?(list|verify|check|show)\b/i.test(lower) ||
      /\b(find\s+open\s+prs|check\s+prs)\b.+\band\s+(send|summarize|email)\b/i.test(lower) ||
      /\b(plan|organize)\s+(my\s+)?day\b.+\band\s+(create|add)\b/i.test(lower)
    ) {
      // Split into candidate subgoals
      const subgoals: string[] = []
      const parts = trimmed.split(/\band\s+then\b|\bafter\s+that\b|\bthen\b|\band\s+also\b/i)
      for (const part of parts) {
        const cleanPart = part.trim().replace(/^[,.\s]+|[,.\s]+$/g, "")
        if (cleanPart.length > 3) {
          subgoals.push(cleanPart)
        }
      }

      return {
        needsClarification: false,
        mode: "QUEST",
        category: "QUEST",
        intentKind: "GOAL_MULTI_STEP",
        confidence: 0.95,
        subgoals: subgoals.length >= 2 ? subgoals : undefined,
        reason: "Detected multi-step sequential connectors or chained capability actions.",
        fastPath: true,
      }
    }

    // ========================================================================
    // 2. CHAT (Conversational / Greeting / Identity / Small-talk)
    // ========================================================================
    if (
      /^(hi|hello|hey|yo|sup|greetings)(\s+there)?(\s+jarvis)?([!.,?]*)$/i.test(lower) ||
      /\bgood\s+(morning|afternoon|evening|night)\b/i.test(lower) ||
      /\bhow\s+are\s+you\b|\bhow('s|\s+is)\s+it\s+going\b|\bhow\s+do\s+you\s+do\b/i.test(lower) ||
      /\bwho\s+are\s+you\b|\bwhat\s+is\s+your\s+name\b|\bwhat\s+can\s+you\s+do\b|\bintroduce\s+yourself\b/i.test(lower) ||
      /\b(thanks|thank\s+you|thx|cheers|awesome|cool|great|nice|perfect)\b/i.test(lower) &&
        !/\b(task|email|calendar|event|memory|note|pr|issue)\b/i.test(lower) ||
      /\b(bye|goodbye|see\s+ya|catch\s+you\s+later)\b/i.test(lower) ||
      /^(help|what\s+are\s+your\s+capabilities)([?]*)$/i.test(lower)
    ) {
      return {
        needsClarification: false,
        mode: "CHAT",
        category: "CHAT",
        intentKind: "CONVERSATION",
        confidence: 0.98,
        reason: "Detected standard greeting, pleasantry, or system identity question.",
        fastPath: true,
      }
    }

    // ========================================================================
    // 3. READ (Simple Query / Listing / Search / Inspect)
    // ========================================================================

    // Tasks Read
    if (
      /\b(what|list|show|get|view|check|display|open)\b.+\b(tasks?|todos?|reminders?)\b/i.test(lower) ||
      /\bdo\s+i\s+have\s+(any\s+)?(tasks?|todos?|reminders?)\b/i.test(lower) ||
      /^(my\s+)?(tasks|to-?dos|reminders)[?.]*$/i.test(lower)
    ) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.96,
        targetDomain: "tasks",
        targetCapability: "tasks.list" as CapabilityId,
        reason: "Query matches task listing/viewing pattern.",
        fastPath: true,
      }
    }

    // Calendar Read
    if (
      /\b(show\s+(my\s+)?(apple\s+|google\s+|icloud\s+)?calendar|what's\s+on\s+my\s+(apple\s+|google\s+|icloud\s+)?calendar|list\s+(apple\s+|google\s+|icloud\s+)?calendar\s+events|check\s+(my\s+)?(schedule|(apple\s+|google\s+|icloud\s+)?calendar)|upcoming\s+(meetings|events))\b/i.test(lower) ||
      /^(my\s+)?(apple\s+|google\s+|icloud\s+)?(calendar|schedule|meetings)[?.]*$/i.test(lower)
    ) {
      const isApple = /\b(apple|icloud|mac)\b/i.test(lower)
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.95,
        targetDomain: isApple ? "apple" : "google",
        targetCapability: (isApple ? "apple.calendar.events.list" : "google.calendar.events.list") as CapabilityId,
        reason: isApple ? "Query matches Apple calendar viewing pattern." : "Query matches Google calendar viewing pattern.",
        fastPath: true,
      }
    }

    // Email Read
    if (
      !/\btelegram\b/i.test(lower) &&
      (/\b(check|read|get|view|search|show|list)\b.+\b(emails?|inbox|gmail|messages?)\b/i.test(lower) ||
      /\b(unread|recent)\s+(emails?|inbox|gmail)\b/i.test(lower))
    ) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.95,
        targetDomain: "google",
        targetCapability: "google.mail.messages.list" as CapabilityId,
        reason: "Query matches email retrieval pattern.",
        fastPath: true,
      }
    }

    // Memory Search / Recall
    if (
      /\b(search\s+memor(y|ies)|recall\s+memor(y|ies)|what\s+did\s+i\s+(say|save|tell\s+you)\s+about|do\s+you\s+remember)\b/i.test(lower) ||
      /\brecall\b.+\bfrom\s+memory\b/i.test(lower) ||
      /\brecall\b.+\bmemor(y|ies)\b/i.test(lower)
    ) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.95,
        targetDomain: "memory",
        targetCapability: "memory.recall" as CapabilityId,
        reason: "Query matches memory search/recall pattern.",
        fastPath: true,
      }
    }

    // Notes Search / Read
    if (
      /\b(search\s+notes?|read\s+note|find\s+notes?|look\s+up\s+notes?)\b/i.test(lower)
    ) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.94,
        targetDomain: "obsidian",
        targetCapability: "obsidian.notes.search" as CapabilityId,
        reason: "Query matches Obsidian note reading/search pattern.",
        fastPath: true,
      }
    }

    // GitHub Read (Separated by resource)
    if (/\b(github\s+notifications|my\s+notifications|unread\s+notifications)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.96,
        targetDomain: "github",
        targetCapability: "github.notifications.list" as CapabilityId,
        reason: "Query matches GitHub notifications pattern.",
        fastPath: true,
      }
    }

    if (/\b(open\s+prs?|my\s+pull\s+requests|open\s+pull\s+requests|list\s+prs?|check\s+prs?)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.96,
        targetDomain: "github",
        targetCapability: "github.prs.list" as CapabilityId,
        reason: "Query matches GitHub pull request inspection pattern.",
        fastPath: true,
      }
    }

    if (/\b(my\s+open\s+issues|open\s+issues|github\s+issues|list\s+issues)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.96,
        targetDomain: "github",
        targetCapability: "github.issues.list" as CapabilityId,
        reason: "Query matches GitHub issues inspection pattern.",
        fastPath: true,
      }
    }

    if (/\b(recent\s+commits|git\s+commits|github\s+commits|list\s+commits)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.95,
        targetDomain: "github",
        targetCapability: "github.commits.list" as CapabilityId,
        reason: "Query matches GitHub commits inspection pattern.",
        fastPath: true,
      }
    }

    // Telegram Read
    if (/\b(telegram\s+(messages|updates)|check\s+telegram|get\s+telegram\s+messages|read\s+telegram)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.95,
        targetDomain: "telegram",
        targetCapability: "telegram.messages.get" as CapabilityId,
        reason: "Query matches Telegram message inspection pattern.",
        fastPath: true,
      }
    }

    // Wake Words Read
    if (/\b(list\s+wake\s+words|show\s+wake\s+words|get\s+wake\s+words)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.96,
        targetDomain: "wake_words",
        targetCapability: "wake_words.list" as CapabilityId,
        reason: "Query matches wake word listing pattern.",
        fastPath: true,
      }
    }

    // Web Search Read
    if (
      /^(search\s+the\s+web\s+for|search\s+web\s+for|search\s+for|google|look\s+up\s+online)\s+(.+)$/i.test(lower)
    ) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.92,
        targetDomain: "research",
        targetCapability: "research.web_search" as CapabilityId,
        reason: "Query matches web search pattern.",
        fastPath: true,
      }
    }

    // ========================================================================
    // 4. ACTION (Direct Single Mutating Action)
    // ========================================================================

    // Task Create / Add / Remind
    if (
      /\b(create\s+(a\s+)?task|add\s+(a\s+)?task|new\s+task|remind\s+me\s+to|add\s+to\s+my\s+to-?do\s+list|i\s+need\s+to)\b/i.test(lower)
    ) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.96,
        targetDomain: "tasks",
        targetCapability: "tasks.create" as CapabilityId,
        reason: "Query matches task creation/reminder pattern.",
        fastPath: true,
      }
    }

    // Task Complete / Delete by specific ID
    if (/\b(complete\s+task|mark\s+task\s+#?\d+\s+as\s+done|finish\s+task\s+#?\d+)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.97,
        targetDomain: "tasks",
        targetCapability: "tasks.complete" as CapabilityId,
        reason: "Query matches task completion pattern.",
        fastPath: true,
      }
    }

    if (/\b(delete\s+task\s+#?\d+|remove\s+task\s+#?\d+)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.97,
        targetDomain: "tasks",
        targetCapability: "tasks.delete" as CapabilityId,
        reason: "Query matches explicit task deletion with target ID.",
        fastPath: true,
      }
    }

    // Memory Save / Remember
    if (
      /\b(remember\s+that|save\s+to\s+memory|store\s+in\s+memory|save\s+memory)\b/i.test(lower)
    ) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.95,
        targetDomain: "memory",
        targetCapability: "memory.save" as CapabilityId,
        reason: "Query matches memory saving pattern.",
        fastPath: true,
      }
    }

    // Email Send (Unambiguous with recipient)
    if (
      /\b(send\s+email\s+to|send\s+an\s+email\s+to)\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(lower)
    ) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.95,
        targetDomain: "google",
        targetCapability: "google.mail.message.send" as CapabilityId,
        reason: "Query matches email sending with explicit recipient.",
        fastPath: true,
      }
    }

    // Calendar Create Event
    if (
      /\b(create\s+(an?\s+)?(apple\s+|google\s+|icloud\s+)?calendar\s+event|schedule\s+(an?\s+)?(apple\s+|google\s+|icloud\s+)?(meeting|event))\b/i.test(lower)
    ) {
      const isApple = /\b(apple|icloud|mac)\b/i.test(lower)
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.94,
        targetDomain: isApple ? "apple" : "google",
        targetCapability: (isApple ? "apple.calendar.event.create" : "google.calendar.event.create") as CapabilityId,
        reason: isApple ? "Query matches Apple calendar event creation pattern." : "Query matches Google calendar event creation pattern.",
        fastPath: true,
      }
    }

    // Calendar Delete Event
    if (
      /\b(delete\s+(an?\s+)?(apple\s+|google\s+|icloud\s+)?(calendar\s+event|meeting)|cancel\s+(an?\s+)?(apple\s+|google\s+|icloud\s+)?(calendar\s+event|meeting)|remove\s+(an?\s+)?(apple\s+|google\s+|icloud\s+)?(calendar\s+event|meeting))\b/i.test(lower)
    ) {
      const isApple = /\b(apple|icloud|mac)\b/i.test(lower)
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.94,
        targetDomain: isApple ? "apple" : "google",
        targetCapability: (isApple ? "apple.calendar.event.delete" : "google.calendar.event.delete") as CapabilityId,
        reason: isApple ? "Query matches Apple calendar event deletion pattern." : "Query matches Google calendar event deletion pattern.",
        fastPath: true,
      }
    }

    // GitHub Issue Create / Comment
    if (/\b(create\s+(a\s+)?(github\s+)?issue|open\s+(a\s+)?(github\s+)?issue|new\s+github\s+issue)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.95,
        targetDomain: "github",
        targetCapability: "github.issue.create" as CapabilityId,
        reason: "Query matches GitHub issue creation pattern.",
        fastPath: true,
      }
    }

    if (/\b(comment\s+on\s+(github\s+)?issue|add\s+comment\s+to\s+issue)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.95,
        targetDomain: "github",
        targetCapability: "github.issue.comment" as CapabilityId,
        reason: "Query matches GitHub issue commenting pattern.",
        fastPath: true,
      }
    }

    // Telegram Message Send
    if (/\b(send\s+(a\s+)?telegram\s+message|telegram\s+send|send\s+on\s+telegram|message\s+on\s+telegram)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.95,
        targetDomain: "telegram",
        targetCapability: "telegram.message.send" as CapabilityId,
        reason: "Query matches Telegram message sending pattern.",
        fastPath: true,
      }
    }

    // Obsidian Note Create / Append
    if (/\b(append\s+to\s+(daily\s+)?note|add\s+to\s+daily\s+note|append\s+daily\s+note)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.95,
        targetDomain: "obsidian",
        targetCapability: "obsidian.note.append" as CapabilityId,
        reason: "Query matches Obsidian note append pattern.",
        fastPath: true,
      }
    }

    if (/\b(create\s+(a\s+)?note|new\s+note|save\s+note|write\s+note)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.94,
        targetDomain: "obsidian",
        targetCapability: "obsidian.note.create" as CapabilityId,
        reason: "Query matches Obsidian note creation pattern.",
        fastPath: true,
      }
    }

    // Preferences Set
    if (/\b(set\s+preference|change\s+theme|set\s+theme)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.95,
        targetDomain: "preferences",
        targetCapability: "preferences.set" as CapabilityId,
        reason: "Query matches preference setting pattern.",
        fastPath: true,
      }
    }

    // Wake Word Remove
    if (/\b(remove\s+wake\s+word|delete\s+wake\s+word)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.96,
        targetDomain: "wake_words",
        targetCapability: "wake_words.remove" as CapabilityId,
        reason: "Query matches wake word removal pattern.",
        fastPath: true,
      }
    }

    // Wake Word Add
    if (/\b(add\s+wake\s+word|new\s+wake\s+word)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.96,
        targetDomain: "wake_words",
        targetCapability: "wake_words.add" as CapabilityId,
        reason: "Query matches wake word addition pattern.",
        fastPath: true,
      }
    }

    return null
  }
}

export const deterministicFastPathClassifier = new DeterministicFastPathClassifier()
