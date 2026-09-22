/**
 * JARVIS CORE V2 — REAL MODEL ADAPTER
 * 
 * Checkpoint: Pre-Migration Gate B
 * Wraps real provider implementations from lib/providers.ts into Core V2 ModelAdapter
 * interfaces for ProviderRoleRouter integration.
 * 
 * Invariants:
 * 1. Zero Model Authority: Models generate candidate text or typed objects; they have
 *    ZERO authority to authorize actions or claim operations.
 * 2. Provider Independence: Bridges Vercel AI SDK language models into Core V2 contracts.
 * 3. Offline CI Safety: Mocks remain the default in automated test runs unless explicitly opt-in.
 */

import { generateText as aiGenerateText, generateObject as aiGenerateObject, type LanguageModel } from "ai"
import { z } from "zod"
import type {
  ModelAdapter,
  ModelRequestOptions,
  ModelResponse,
  ObjectGenerationResult,
  RoleRoutingConfig,
} from "./types"
import {
  getProviderDefinition,
  type ProviderId,
  markProviderCooldown,
} from "../../providers"
import { ProviderRoleRouter } from "./router"
import type { ProviderRole } from "../types"

export class RealAiSdkModelAdapter implements ModelAdapter {
  constructor(
    readonly providerId: string,
    readonly displayName: string,
    private readonly createModelFn: () => LanguageModel,
    private readonly hasKeyFn: () => boolean,
  ) {}

  public isAvailable(): boolean {
    return this.hasKeyFn()
  }

  public async generateText(prompt: string, options?: ModelRequestOptions): Promise<ModelResponse> {
    const start = Date.now()
    const signal = options?.deadline?.getSignal() ?? options?.signal

    try {
      const model = this.createModelFn()
      const result = await aiGenerateText({
        model,
        prompt,
        system: options?.systemPrompt,
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
        abortSignal: signal,
      })

      const latencyMs = Date.now() - start
      const usage = result.usage as any
      return {
        text: result.text,
        model: options?.modelOverride ?? this.displayName,
        providerId: this.providerId,
        latencyMs,
        usage: usage
          ? {
              promptTokens: usage.promptTokens ?? usage.inputTokens ?? 0,
              completionTokens: usage.completionTokens ?? usage.outputTokens ?? 0,
              totalTokens: usage.totalTokens ?? 0,
            }
          : undefined,
      }
    } catch (error: any) {
      markProviderCooldown(this.providerId as ProviderId, error)
      throw error
    }
  }

  public async generateObject<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: ModelRequestOptions
  ): Promise<ObjectGenerationResult<T>> {
    const start = Date.now()
    const signal = options?.deadline?.getSignal() ?? options?.signal

    try {
      const model = this.createModelFn()
      const result = await aiGenerateObject({
        model,
        schema,
        prompt,
        system: options?.systemPrompt,
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
        abortSignal: signal,
      })

      const latencyMs = Date.now() - start
      const usage = result.usage as any
      return {
        object: result.object as T,
        response: {
          text: JSON.stringify(result.object),
          model: options?.modelOverride ?? this.displayName,
          providerId: this.providerId,
          latencyMs,
          usage: usage
            ? {
                promptTokens: usage.promptTokens ?? usage.inputTokens ?? 0,
                completionTokens: usage.completionTokens ?? usage.outputTokens ?? 0,
                totalTokens: usage.totalTokens ?? 0,
              }
            : undefined,
        },
      }
    } catch (error: any) {
      markProviderCooldown(this.providerId as ProviderId, error)
      throw error
    }
  }
}

/**
 * Creates ModelAdapter instances for all registered providers in lib/providers.ts.
 */
export function createRealProviderAdapters(): ModelAdapter[] {
  const providerIds: ProviderId[] = ["gemini", "groq", "openrouter", "nvidia", "ollama"]
  const adapters: ModelAdapter[] = []

  for (const id of providerIds) {
    const def = getProviderDefinition(id)
    if (def) {
      adapters.push(
        new RealAiSdkModelAdapter(
          def.id,
          def.label,
          def.createModel,
          def.hasKey
        )
      )
    }
  }

  return adapters
}

/**
 * Creates a configured ProviderRoleRouter using real providers from lib/providers.ts.
 */
export function createRealProviderRoleRouter(
  customRoleConfigs?: Partial<Record<ProviderRole, RoleRoutingConfig>>
): ProviderRoleRouter {
  const router = new ProviderRoleRouter()
  const adapters = createRealProviderAdapters()
  for (const adapter of adapters) {
    router.registerAdapter(adapter)
  }

  const defaultRoles: ProviderRole[] = ["CHAT", "ACTION_RESOLVER", "PLANNER", "REPLANNER", "FINALIZER"]
  for (const role of defaultRoles) {
    if (customRoleConfigs?.[role]) {
      router.configureRole(customRoleConfigs[role]!)
    } else {
      router.configureRole({
        role,
        primaryProvider: "gemini",
        primaryModel: "gemini-3.6-flash",
        fallbackProvider: "groq",
        fallbackModel: "openai/gpt-oss-20b",
      })
    }
  }

  return router
}
