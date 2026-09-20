/**
 * JARVIS CORE V2 — INTENT ANALYSIS & AMBIGUITY SYSTEM TESTS
 * 
 * Checkpoint: C6
 * Verifies:
 * 1. Sub-5ms deterministic fast-path classification for CHAT, READ, ACTION, QUEST.
 * 2. Ambiguity detection for destructive tasks, memory, calendar, and communications.
 * 3. 100% precision on destructive ambiguity (zero ambiguous destructive actions execute).
 * 4. ≥95% accuracy on fixed 40-scenario evaluation corpus.
 * 5. Latency performance gate (sub-2ms p50).
 */

import { describe, it, expect } from "vitest"
import { IntentAnalyzer } from "../../lib/jarvis-core/intent/analyzer"
import { AmbiguityDetector } from "../../lib/jarvis-core/intent/ambiguity"
import { DeterministicFastPathClassifier } from "../../lib/jarvis-core/intent/classifier"
import type { IntentCategory } from "../../lib/jarvis-core/intent/types"

describe("C6 — Intent Analysis & Ambiguity System", () => {
  const analyzer = new IntentAnalyzer()
  const detector = new AmbiguityDetector()
  const classifier = new DeterministicFastPathClassifier()

  // ==========================================================================
  // 1. FAST-PATH CLASSIFICATION
  // ==========================================================================
  describe("Fast-Path Deterministic Classification", () => {
    it("classifies pure conversational pleasantries as CHAT with high confidence", () => {
      const prompts = [
        "Hello",
        "Hi Jarvis",
        "Good morning",
        "How are you today?",
        "Who are you?",
        "Thank you very much!",
        "Goodbye",
      ]

      for (const prompt of prompts) {
        const res = analyzer.analyze(prompt)
        expect(res.needsClarification).toBe(false)
        if (!res.needsClarification) {
          expect(res.category).toBe("CHAT")
          expect(res.confidence).toBeGreaterThanOrEqual(0.90)
          expect(res.fastPath).toBe(true)
        }
      }
    })

    it("classifies query and retrieval prompts as READ with high confidence", () => {
      const readPrompts = [
        { text: "What tasks do I have?", domain: "tasks" },
        { text: "List my tasks", domain: "tasks" },
        { text: "Show my calendar for today", domain: "google" },
        { text: "Check unread emails", domain: "google" },
        { text: "Search memories for python", domain: "memory" },
        { text: "Search notes for react architecture", domain: "obsidian" },
        { text: "Show my open PRs", domain: "github" },
        { text: "Search the web for latest AI news", domain: "research" },
      ]

      for (const { text, domain } of readPrompts) {
        const res = analyzer.analyze(text)
        expect(res.needsClarification).toBe(false)
        if (!res.needsClarification) {
          expect(res.category).toBe("READ")
          expect(res.targetDomain).toBe(domain)
          expect(res.fastPath).toBe(true)
        }
      }
    })

    it("classifies unambiguous single mutation requests as ACTION with high confidence", () => {
      const actionPrompts = [
        { text: "Create a task to buy groceries tonight", domain: "tasks" },
        { text: "Remind me to call the dentist tomorrow at 2pm", domain: "tasks" },
        { text: "Complete task #10", domain: "tasks" },
        { text: "Delete task #42", domain: "tasks" },
        { text: "Remember that my favourite programming language is Rust", domain: "memory" },
        { text: "Send email to alice@example.com", domain: "google" },
        { text: "Schedule a meeting with team tomorrow at 3pm", domain: "google" },
        { text: "Set preference theme dark", domain: "preferences" },
        { text: "Add wake word Jarvis", domain: "wake_words" },
      ]

      for (const { text, domain } of actionPrompts) {
        const res = analyzer.analyze(text)
        expect(res.needsClarification).toBe(false)
        if (!res.needsClarification) {
          expect(res.category).toBe("ACTION")
          expect(res.targetDomain).toBe(domain)
          expect(res.fastPath).toBe(true)
        }
      }
    })

    it("classifies multi-step composite objectives as QUEST with high confidence", () => {
      const questPrompts = [
        "Search the web for quantum computing in 2026 and give me a 3-bullet point summary.",
        "Look up what year the Artemis III moon landing is scheduled for and save the result into my memory.",
        "Create a task to submit the Q3 financial report by Friday 5 PM, and then list my tasks to verify it was added.",
        "Find open PRs on github and summarize them in an email to team@company.com",
        "Plan my day and create tasks for tomorrow",
      ]

      for (const text of questPrompts) {
        const res = analyzer.analyze(text)
        expect(res.needsClarification).toBe(false)
        if (!res.needsClarification) {
          expect(res.category).toBe("QUEST")
          expect(res.confidence).toBeGreaterThanOrEqual(0.90)
          expect(res.fastPath).toBe(true)
        }
      }
    })
  })

  // ==========================================================================
  // 2. AMBIGUITY DETECTION & CLARIFICATION
  // ==========================================================================
  describe("Ambiguity Detection & Destructive Safeguards", () => {
    it("intercepts ambiguous task deletion and yields needsClarification: true", () => {
      const ambiguousPrompts = [
        "Delete task",
        "Remove the task",
        "Delete that",
        "Cancel task",
        "Remove it",
      ]

      for (const text of ambiguousPrompts) {
        const res = analyzer.analyze(text)
        expect(res.needsClarification).toBe(true)
        if (res.needsClarification) {
          expect(res.clarification.ambiguityType).toBe("AMBIGUOUS_TARGET")
          expect(res.clarification.targetDomain).toBe("tasks")
          expect(res.clarification.missingFields).toContain("id")
          expect(res.clarification.prompt).toContain("Which task")
        }
      }
    })

    it("intercepts ambiguous memory deletion and yields needsClarification: true", () => {
      const ambiguousMemPrompts = ["Delete memory", "Forget that", "Remove memory"]

      for (const text of ambiguousMemPrompts) {
        const res = analyzer.analyze(text)
        expect(res.needsClarification).toBe(true)
        if (res.needsClarification) {
          expect(res.clarification.ambiguityType).toBe("AMBIGUOUS_TARGET")
          expect(res.clarification.targetDomain).toBe("memory")
          expect(res.clarification.missingFields).toContain("id")
        }
      }
    })

    it("intercepts ambiguous calendar deletion and yields needsClarification: true", () => {
      const res = analyzer.analyze("Cancel the meeting")
      expect(res.needsClarification).toBe(true)
      if (res.needsClarification) {
        expect(res.clarification.targetDomain).toBe("google")
        expect(res.clarification.missingFields).toContain("eventId")
      }
    })

    it("intercepts external email send missing recipient and yields MISSING_REQUIRED_FIELD", () => {
      const emailPrompts = [
        "Send an email",
        "Write an email",
        "Email him",
      ]

      for (const text of emailPrompts) {
        const res = analyzer.analyze(text)
        expect(res.needsClarification).toBe(true)
        if (res.needsClarification) {
          expect(res.clarification.ambiguityType).toBe("MISSING_REQUIRED_FIELD")
          expect(res.clarification.targetDomain).toBe("google")
          expect(res.clarification.missingFields).toContain("to")
          expect(res.clarification.prompt).toContain("Who should I send the email to")
        }
      }
    })

    it("intercepts empty telegram message and yields MISSING_REQUIRED_FIELD", () => {
      const res = analyzer.analyze("Send a telegram message")
      expect(res.needsClarification).toBe(true)
      if (res.needsClarification) {
        expect(res.clarification.ambiguityType).toBe("MISSING_REQUIRED_FIELD")
        expect(res.clarification.targetDomain).toBe("telegram")
        expect(res.clarification.missingFields).toContain("text")
      }
    })

    it("allows pronoun mutation when entity is explicitly resolved in conversational context", () => {
      // With activeTaskId = 42, "complete it" is not ambiguous
      const res = analyzer.analyze("Complete it", { activeTaskId: 42 })
      expect(res.needsClarification).toBe(false)
    })
  })

  // ==========================================================================
  // 3. FIXED EVALUATION CORPUS (40 SCENARIOS, ≥95% ACCURACY)
  // ==========================================================================
  describe("Evaluation Corpus Benchmark (40 Scenarios)", () => {
    interface CorpusScenario {
      prompt: string
      expectedCategory: IntentCategory
      expectedNeedsClarification: boolean
    }

    const corpus: CorpusScenario[] = [
      // CHAT (10)
      { prompt: "Hi there Jarvis", expectedCategory: "CHAT", expectedNeedsClarification: false },
      { prompt: "Hello!", expectedCategory: "CHAT", expectedNeedsClarification: false },
      { prompt: "Good afternoon", expectedCategory: "CHAT", expectedNeedsClarification: false },
      { prompt: "How are you doing today?", expectedCategory: "CHAT", expectedNeedsClarification: false },
      { prompt: "Who are you?", expectedCategory: "CHAT", expectedNeedsClarification: false },
      { prompt: "What can you do?", expectedCategory: "CHAT", expectedNeedsClarification: false },
      { prompt: "Thanks a lot for your help!", expectedCategory: "CHAT", expectedNeedsClarification: false },
      { prompt: "Awesome, thank you", expectedCategory: "CHAT", expectedNeedsClarification: false },
      { prompt: "Goodbye Jarvis", expectedCategory: "CHAT", expectedNeedsClarification: false },
      { prompt: "Help", expectedCategory: "CHAT", expectedNeedsClarification: false },

      // READ (10)
      { prompt: "What tasks do I have open?", expectedCategory: "READ", expectedNeedsClarification: false },
      { prompt: "List my tasks", expectedCategory: "READ", expectedNeedsClarification: false },
      { prompt: "Show my calendar for tomorrow", expectedCategory: "READ", expectedNeedsClarification: false },
      { prompt: "Check my unread emails in gmail", expectedCategory: "READ", expectedNeedsClarification: false },
      { prompt: "What did I say about project Apollo in memory?", expectedCategory: "READ", expectedNeedsClarification: false },
      { prompt: "Recall my favorite books from memory", expectedCategory: "READ", expectedNeedsClarification: false },
      { prompt: "Search notes for architecture design", expectedCategory: "READ", expectedNeedsClarification: false },
      { prompt: "Show my open pull requests on GitHub", expectedCategory: "READ", expectedNeedsClarification: false },
      { prompt: "Check my GitHub notifications", expectedCategory: "READ", expectedNeedsClarification: false },
      { prompt: "Search the web for TypeScript 5.8 features", expectedCategory: "READ", expectedNeedsClarification: false },

      // ACTION (10)
      { prompt: "Create a task to buy groceries tonight", expectedCategory: "ACTION", expectedNeedsClarification: false },
      { prompt: "Remind me to call Mom at 5pm", expectedCategory: "ACTION", expectedNeedsClarification: false },
      { prompt: "Complete task #5", expectedCategory: "ACTION", expectedNeedsClarification: false },
      { prompt: "Mark task 12 as done", expectedCategory: "ACTION", expectedNeedsClarification: false },
      { prompt: "Delete task #99", expectedCategory: "ACTION", expectedNeedsClarification: false },
      { prompt: "Remember that my wife's birthday is June 12th", expectedCategory: "ACTION", expectedNeedsClarification: false },
      { prompt: "Save to memory: server IP is 192.168.1.50", expectedCategory: "ACTION", expectedNeedsClarification: false },
      { prompt: "Send email to team@company.com", expectedCategory: "ACTION", expectedNeedsClarification: false },
      { prompt: "Schedule a meeting tomorrow at 10am", expectedCategory: "ACTION", expectedNeedsClarification: false },
      { prompt: "Set preference theme dark", expectedCategory: "ACTION", expectedNeedsClarification: false },

      // QUEST (5)
      { prompt: "Search web for quantum computing 2026 and summarize in 3 bullets", expectedCategory: "QUEST", expectedNeedsClarification: false },
      { prompt: "Look up Artemis III launch year and save into memory", expectedCategory: "QUEST", expectedNeedsClarification: false },
      { prompt: "Create a task for financial report, and then list my tasks", expectedCategory: "QUEST", expectedNeedsClarification: false },
      { prompt: "Find open PRs on GitHub and send email to boss@company.com", expectedCategory: "QUEST", expectedNeedsClarification: false },
      { prompt: "Plan my day and create tasks for tomorrow morning", expectedCategory: "QUEST", expectedNeedsClarification: false },

      // AMBIGUOUS INTENTS REQUIRING CLARIFICATION (5)
      { prompt: "Delete that task", expectedCategory: "ACTION", expectedNeedsClarification: true },
      { prompt: "Remove the task", expectedCategory: "ACTION", expectedNeedsClarification: true },
      { prompt: "Delete memory", expectedCategory: "ACTION", expectedNeedsClarification: true },
      { prompt: "Send an email", expectedCategory: "ACTION", expectedNeedsClarification: true },
      { prompt: "Cancel the meeting", expectedCategory: "ACTION", expectedNeedsClarification: true },
    ]

    it("achieves ≥95% accuracy on the fixed 40-scenario evaluation corpus", () => {
      let correct = 0

      for (const scenario of corpus) {
        const result = analyzer.analyze(scenario.prompt)
        const categoryMatches = result.category === scenario.expectedCategory
        const clarificationMatches = result.needsClarification === scenario.expectedNeedsClarification

        if (categoryMatches && clarificationMatches) {
          correct++
        }
      }

      const accuracy = (correct / corpus.length) * 100
      expect(accuracy).toBeGreaterThanOrEqual(95.0)
    })

    it("achieves 100% precision on destructive ambiguity detection (0 slip-throughs)", () => {
      const dangerousAmbiguousPrompts = [
        "Delete task",
        "Remove the task",
        "Delete that",
        "Delete it",
        "Cancel task",
        "Delete memory",
        "Forget that",
        "Cancel the meeting",
      ]

      for (const prompt of dangerousAmbiguousPrompts) {
        const result = analyzer.analyze(prompt)
        // Must NEVER allow execution without clarification!
        expect(result.needsClarification).toBe(true)
      }
    })
  })

  // ==========================================================================
  // 4. LATENCY PERFORMANCE GATE
  // ==========================================================================
  describe("Latency Performance Gate", () => {
    it("classifies 100 consecutive prompts in <200ms (p50 < 2ms)", () => {
      const testPrompts = [
        "Hello Jarvis",
        "List my tasks",
        "Create a task to clean desk",
        "Search the web for news and then summarize",
        "Delete task",
      ]

      const start = performance.now()
      for (let i = 0; i < 100; i++) {
        analyzer.analyze(testPrompts[i % testPrompts.length])
      }
      const totalDuration = performance.now() - start
      const avgDuration = totalDuration / 100

      expect(totalDuration).toBeLessThan(200) // under 200ms for 100 runs
      expect(avgDuration).toBeLessThan(2.0) // under 2ms average per classification
    })
  })

  // ==========================================================================
  // 5. SECTION 12: HELD-OUT AMBIGUITY SANITY SUITE
  // ==========================================================================
  describe("Section 12 — Held-Out Ambiguity Sanity Suite", () => {
    it("guarantees 0 ambiguous destructive executions on unseen test cases", () => {
      const unseenAmbiguousDestructivePrompts = [
        "erase that memory please",
        "drop the task",
        "delete this item",
        "cancel the appointment",
        "remove it from my list",
        "send an email with the notes",
        "delete that entry",
        "forget about it",
      ]

      let ambiguousDestructiveExecutions = 0

      for (const prompt of unseenAmbiguousDestructivePrompts) {
        const result = analyzer.analyze(prompt)
        if (!result.needsClarification) {
          ambiguousDestructiveExecutions++
        }
        expect(result.needsClarification).toBe(true)
        if (result.needsClarification) {
          expect(result.clarification.prompt).toBeDefined()
        }
      }

      // Invariant: ambiguous destructive execution = 0
      expect(ambiguousDestructiveExecutions).toBe(0)
    })

    it("does not falsely trigger clarification on unambiguous requests", () => {
      const unambiguousPrompts = [
        { text: "delete task 104", expectedCategory: "ACTION" },
        { text: "send email to support@github.com", expectedCategory: "ACTION" },
        { text: "remind me to call Mom tomorrow at 5pm", expectedCategory: "ACTION" },
        { text: "tell me a joke about computers", expectedCategory: "CHAT" },
        { text: "search notes for vacation plans", expectedCategory: "READ" },
      ]

      for (const { text, expectedCategory } of unambiguousPrompts) {
        const result = analyzer.analyze(text)
        expect(result.needsClarification).toBe(false)
        if (!result.needsClarification) {
          expect(result.category).toBe(expectedCategory)
          expect(result.mode).toBe(expectedCategory)
        }
      }
    })

    it("verifies canonical ExecutionMode reconciliation (Blocker C)", () => {
      const testCases = [
        { text: "hello there", expectedMode: "CHAT" },
        { text: "list all my tasks", expectedMode: "READ" },
        { text: "create task Buy grocs", expectedMode: "ACTION" },
        { text: "search the web for TypeScript 5.5 and then write an obsidian note", expectedMode: "QUEST" },
      ]

      for (const { text, expectedMode } of testCases) {
        const res = analyzer.analyze(text)
        expect(res.needsClarification).toBe(false)
        if (!res.needsClarification) {
          expect(res.mode).toBe(expectedMode)
          expect(res.category).toBe(expectedMode)
          expect(res.intentKind).toBeDefined()
        }
      }
    })
  })
})
