/**
 * JARVIS CORE V2 — SECRET & CREDENTIAL REDACTION ENGINE
 * 
 * Checkpoint: C15 (Section C15.2)
 * Status: Authoritative Secret Redaction Subsystem
 * 
 * Architectural Invariants:
 * 1. Outbound Sanitization: All final text emitted to users or streams MUST be scrubbed of secrets.
 * 2. High Recall: Covers known API keys, tokens, auth headers, passwords, and private keys.
 * 3. Non-Destructive Formatting: Replaces matched sensitive patterns with structured tags like
 *    [REDACTED_API_KEY] or [REDACTED_SECRET].
 */

export interface RedactionResult {
  readonly sanitizedText: string
  readonly redactedCount: number
}

const SECRET_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // Private keys
  {
    regex: /-----BEGIN [A-Z\s]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z\s]+ PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
  },
  // JWT tokens
  {
    regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
    replacement: "[REDACTED_JWT_TOKEN]",
  },
  // OpenAI API keys
  {
    regex: /\bsk-[a-zA-Z0-9]{20,T3BlbkFJ[a-zA-Z0-9]{20,}\b/g,
    replacement: "[REDACTED_OPENAI_KEY]",
  },
  {
    regex: /\bsk-[a-zA-Z0-9_-]{32,}\b/g,
    replacement: "[REDACTED_API_KEY]",
  },
  // Anthropic API keys
  {
    regex: /\bsk-ant-[a-zA-Z0-9_-]{32,}\b/g,
    replacement: "[REDACTED_ANTHROPIC_KEY]",
  },
  // GitHub Personal Access Tokens
  {
    regex: /\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
  },
  {
    regex: /\bgithub_pat_[a-zA-Z0-9_]{50,}\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
  },
  // Google API keys
  {
    regex: /\bAIza[0-9A-Za-z-_]{35}\b/g,
    replacement: "[REDACTED_GOOGLE_API_KEY]",
  },
  // Telegram bot tokens (e.g. 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789)
  {
    regex: /\b\d{8,10}:[a-zA-Z0-9_-]{35}\b/g,
    replacement: "[REDACTED_TELEGRAM_TOKEN]",
  },
  // Tavily API keys
  {
    regex: /\btvly-[a-zA-Z0-9]{20,}\b/g,
    replacement: "[REDACTED_TAVILY_KEY]",
  },
  // Slack tokens
  {
    regex: /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    replacement: "[REDACTED_SLACK_TOKEN]",
  },
  // Bearer authentication headers
  {
    regex: /Bearer\s+[a-zA-Z0-9_\-\.]{16,}/gi,
    replacement: "Bearer [REDACTED_BEARER_TOKEN]",
  },
  // Basic auth in URLs: https://user:password@host
  {
    regex: /(https?:\/\/)([^:\s]+):([^@\s]+)@/gi,
    replacement: "$1$2:[REDACTED_PASSWORD]@",
  },
]

export function redactSecrets(text: string): RedactionResult {
  if (!text) return { sanitizedText: text, redactedCount: 0 }

  let sanitized = text
  let count = 0

  for (const { regex, replacement } of SECRET_PATTERNS) {
    const matches = sanitized.match(regex)
    if (matches) {
      count += matches.length
      sanitized = sanitized.replace(regex, replacement)
    }
  }

  return { sanitizedText: sanitized, redactedCount: count }
}
