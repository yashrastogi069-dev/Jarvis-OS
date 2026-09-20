/**
 * JARVIS CORE V2 — INTENT & AMBIGUITY ANALYZER
 * 
 * Checkpoint: C6 (Sections C6.1 – C6.10)
 * Status: Authoritative Intent Classification & Ambiguity Resolution Gateway
 * 
 * Invariants:
 * 1. Clarification Precedence: Ambiguous destructive intents are intercepted before routing.
 * 2. Deterministic Fast-Path: High-confidence common requests resolve in <2ms with zero LLM tokens.
 * 3. Complete Type Safety: Output is strictly discriminated by `needsClarification: boolean`.
 */

import { ambiguityDetector, AmbiguityDetector } from "./ambiguity"
import { deterministicFastPathClassifier, DeterministicFastPathClassifier } from "./classifier"
import type {
  IntentAnalysisResult,
  IntentCategory,
  IntentClassifierContext,
  ResolvedIntent,
} from "./types"

export class IntentAnalyzer {
  private readonly classifier: DeterministicFastPathClassifier
  private readonly detector: AmbiguityDetector

  constructor(
    classifier = deterministicFastPathClassifier,
    detector = ambiguityDetector,
  ) {
    this.classifier = classifier
    this.detector = detector
  }

  /**
   * Authoritatively analyze user input for intent category and ambiguity.
   */
  public analyze(text: string, context?: IntentClassifierContext): IntentAnalysisResult {
    const trimmed = text.trim()

    // 1. Ambiguity Pre-Check (Section C6.5: Zero Ambiguous Destructive Execution)
    const clarification = this.detector.detect(trimmed, context)
    if (clarification) {
      // Determine probable intended category
      let cat: IntentCategory = "ACTION"
      if (clarification.intendedAction?.includes("delete")) cat = "ACTION"
      if (clarification.intendedAction?.includes("send")) cat = "ACTION"

      return {
        needsClarification: true,
        mode: cat,
        category: cat,
        intentKind: "MUTATION_SINGLE",
        clarification,
        reason: clarification.reason,
        fastPath: true,
      }
    }

    // 2. Deterministic Fast-Path Classification (Section C6.3)
    const fastResult = this.classifier.classify(trimmed)
    if (fastResult) {
      return fastResult
    }

    // 3. Fallback Heuristic Classification (Section C6.4)
    return this.fallbackClassify(trimmed)
  }

  private fallbackClassify(text: string): ResolvedIntent {
    const lower = text.toLowerCase()

    // Check for conversational status / identity questions
    if (/\b(how\s+are\s+you|who\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do|introduce\s+yourself)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "CHAT",
        category: "CHAT",
        intentKind: "CONVERSATION",
        confidence: 0.90,
        reason: "Conversational identity or status question.",
        fastPath: false,
      }
    }

    // Check for multi-step / complex instructions
    const sentenceCount = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length
    const hasConjunctions = /\b(also|additionally|plus|as well as|and\s+then)\b/i.test(lower)
    if (sentenceCount >= 2 && hasConjunctions) {
      return {
        needsClarification: false,
        mode: "QUEST",
        category: "QUEST",
        intentKind: "GOAL_MULTI_STEP",
        confidence: 0.82,
        reason: "Multi-sentence request with additive conjunctions routed to QUEST.",
        fastPath: false,
      }
    }

    // Check for tool domain read queries (must mention domain entity or query verb)
    const hasReadEntity = /\b(task|todo|calendar|event|meeting|schedule|email|mail|inbox|gmail|memory|memories|note|notes|pr|prs|issue|issues|commit|commits|notification|web|online)\b/i.test(lower)
    if (
      hasReadEntity &&
      /^(what|which|where|when|why|how|who|can you tell me|check|list|show|get|view|search)\b/i.test(lower) &&
      !/\b(create|add|send|save|update|delete|remove)\b/i.test(lower)
    ) {
      return {
        needsClarification: false,
        mode: "READ",
        category: "READ",
        intentKind: "READ_QUERY",
        confidence: 0.85,
        reason: "Interrogative query targeting capability domain classified as READ.",
        fastPath: false,
      }
    }

    // Check for imperative action verbs -> ACTION
    if (/\b(create|add|new|send|post|save|write|update|modify|set|schedule)\b/i.test(lower)) {
      return {
        needsClarification: false,
        mode: "ACTION",
        category: "ACTION",
        intentKind: "MUTATION_SINGLE",
        confidence: 0.85,
        reason: "Imperative mutation keywords classified as ACTION.",
        fastPath: false,
      }
    }

    // Default -> CHAT
    return {
      needsClarification: false,
      mode: "CHAT",
      category: "CHAT",
      intentKind: "CONVERSATION",
      confidence: 0.75,
      reason: "General conversational input without explicit tool indicators.",
      fastPath: false,
    }
  }
}

export const intentAnalyzer = new IntentAnalyzer()
