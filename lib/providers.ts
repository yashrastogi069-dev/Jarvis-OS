import type { LanguageModel } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { OLLAMA_URL, OLLAMA_CHAT_MODEL } from "@/lib/ollama"

/**
 * Provider failsafe chain (PLAN 2.1, revised 2026-07-09 to include Groq):
 *
 *   Gemini 2.5 Flash  →  Groq Llama 3.3 70B  →  OpenRouter (free)  →
 *   NVIDIA NIM Llama 3.3 70B  →  Ollama (local floor)
 *
 * Ordered by free-tier tool-calling reliability. `resolveModel()` returns the
 * first healthy provider (has a key, not in cooldown, not force-disabled).
 * On a 429/quota or 5xx/network failure the caller marks a per-provider
 * cooldown via `markProviderCooldown()` and advances to the next provider.
 *
 * Model choices (documented rationale):
 * - Gemini: `gemini-2.5-flash`. Chosen over `gemini-2.0-flash` for its larger
 *   free-tier RPM/RPD headroom and more reliable streaming tool-calling. The
 *   choice is validated organically by the Phase 1 gate (a real streaming
 *   tool-call turn through /api/chat forced onto Gemini). Flip the constant to
 *   `gemini-2.0-flash` if 2.5 ever loses free-tier tool support.
 * - Groq: `llama-3.3-70b-versatile`. Excellent, fast free-tier tool calling.
 * - OpenRouter: a small rotation of free models that advertise `tools` support
 *   (discovered live from https://openrouter.ai/api/v1/models). On failure the
 *   rotation index advances so a flaky/rate-limited free model is skipped next
 *   time.
 * - NVIDIA: `meta/llama-3.3-70b-instruct` on integrate.api.nvidia.com/v1 (an
 *   OpenAI-compatible NIM), reached with the nvapi- key.
 * - Ollama: local floor; `available()` is always true so the OS degrades to a
 *   local brain when every cloud provider is down. If Ollama itself is down or
 *   the chat model is not pulled, the stream fails honestly (it is last).
 */

export type ProviderId = "gemini" | "groq" | "openrouter" | "nvidia" | "ollama"

const GEMINI_MODEL = "gemini-3.6-flash"
const GROQ_MODEL = "openai/gpt-oss-20b"
const NVIDIA_MODEL = "meta/llama-3.2-11b-vision-instruct"

/** Free OpenRouter models with tool support, in preference order. */
const OPENROUTER_MODELS = [
  "deepseek/deepseek-v4-flash-0731:free",
  "google/gemma-4-26b-a4b-it:free",
  "qwen/qwen3.8-27b:free",
]

interface Cooldown {
  until: number
  reason: string
}

/** Module-level mutable state (survives within a server process). */
const cooldowns = new Map<ProviderId, Cooldown>()
let openRouterIndex = 0

function errText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/** Providers named in FORCE_DISABLE_PROVIDERS (comma-separated) are hidden — a
 *  test hook for demonstrating failover (e.g. FORCE_DISABLE_PROVIDERS=gemini). */
function forciblyDisabled(): Set<string> {
  return new Set(
    (process.env.FORCE_DISABLE_PROVIDERS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

interface ProviderDef {
  id: ProviderId
  label: string
  /** Which env var supplies the key (for status display); null = local. */
  keyVar: string | null
  hasKey: () => boolean
  createModel: () => LanguageModel
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "gemini",
    label: "Gemini 3.6 Flash",
    keyVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    hasKey: () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    createModel: () =>
      createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      })(GEMINI_MODEL),
  },
  {
    id: "groq",
    label: "Groq GPT-OSS 20B",
    keyVar: "GROQ_API_KEY",
    hasKey: () => Boolean(process.env.GROQ_API_KEY),
    createModel: () => createGroq({ apiKey: process.env.GROQ_API_KEY })(GROQ_MODEL),
  },
  {
    id: "openrouter",
    label: "OpenRouter (free)",
    keyVar: "OPENROUTER_API_KEY",
    hasKey: () => Boolean(process.env.OPENROUTER_API_KEY),
    createModel: () => {
      const provider = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
      const model = OPENROUTER_MODELS[openRouterIndex % OPENROUTER_MODELS.length]
      return provider.chat(model)
    },
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM Llama 3.2 11B",
    keyVar: "NVIDIA_API_KEY",
    hasKey: () => Boolean(process.env.NVIDIA_API_KEY),
    createModel: () =>
      createOpenAICompatible({
        name: "nvidia",
        baseURL: "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_API_KEY,
      })(NVIDIA_MODEL),
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    keyVar: null,
    hasKey: () => true,
    createModel: () =>
      createOpenAICompatible({
        name: "ollama",
        baseURL: `${OLLAMA_URL}/v1`,
      })(OLLAMA_CHAT_MODEL),
  },
]

function isCoolingDown(id: ProviderId): boolean {
  const cd = cooldowns.get(id)
  if (!cd) return false
  if (Date.now() >= cd.until) {
    cooldowns.delete(id)
    return false
  }
  return true
}

function isAvailable(def: ProviderDef, disabled: Set<string>): boolean {
  if (disabled.has(def.id)) return false
  if (!def.hasKey()) return false
  if (isCoolingDown(def.id)) return false
  return true
}

export interface ResolvedProvider {
  id: ProviderId
  label: string
  model: LanguageModel
}

/** All currently-healthy providers, in chain order (may be empty). */
export function getResolutionChain(): ResolvedProvider[] {
  const disabled = forciblyDisabled()
  return PROVIDERS.filter((def) => isAvailable(def, disabled)).map((def) => ({
    id: def.id,
    label: def.label,
    model: def.createModel(),
  }))
}

/** First healthy provider; falls back to the local Ollama floor if none. */
export function resolveModel(): ResolvedProvider {
  const chain = getResolutionChain()
  if (chain.length > 0) return chain[0]
  const ollama = PROVIDERS.find((p) => p.id === "ollama")!
  return { id: ollama.id, label: ollama.label, model: ollama.createModel() }
}

/** The provider id that a new chat turn would use right now. */
export function getActiveProviderId(): ProviderId {
  return resolveModel().id
}

/**
 * Put a provider on cooldown after a failure and advance the chain.
 * 429 / quota / rate-limit -> 45s (prevents 10-minute system freeze on transient burst limits);
 * everything else (5xx, network) -> 30s.
 */
export function markProviderCooldown(id: ProviderId, error: unknown): void {
  const msg = errText(error)
  const isQuota = /\b429\b|quota|rate.?limit|resource.?exhausted|too many requests/i.test(msg)
  const durationMs = isQuota ? 45_000 : 30_000
  cooldowns.set(id, { until: Date.now() + durationMs, reason: msg.slice(0, 200) })
  if (id === "openrouter") openRouterIndex += 1
}

export type ProviderHealth = "active" | "ready" | "cooling" | "down"

export interface ProviderStatus {
  id: ProviderId
  label: string
  status: ProviderHealth
  hasKey: boolean
  cooldownUntil: number | null
  cooldownReason: string | null
}

/** Live chain status for the settings panel and /api/health. */
export function getProviderStatus(): ProviderStatus[] {
  const disabled = forciblyDisabled()
  let activeAssigned = false
  return PROVIDERS.map((def) => {
    const hasKey = def.hasKey()
    const cooling = isCoolingDown(def.id)
    const off = disabled.has(def.id)
    let status: ProviderHealth
    if (!hasKey || off) {
      status = "down"
    } else if (cooling) {
      status = "cooling"
    } else if (!activeAssigned) {
      status = "active"
      activeAssigned = true
    } else {
      status = "ready"
    }
    const cd = cooldowns.get(def.id)
    return {
      id: def.id,
      label: def.label,
      status,
      hasKey,
      cooldownUntil: cd?.until ?? null,
      cooldownReason: cd?.reason ?? null,
    }
  })
}
