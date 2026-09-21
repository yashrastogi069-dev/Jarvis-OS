/**
 * JARVIS CORE V2 — PROVIDER-ROLE ROUTER
 * 
 * Checkpoint: C14 (Section C14.4)
 * Status: Authoritative Provider-Role Routing Engine
 * 
 * Architectural Invariants:
 * 1. Role-Based Routing: Every model request specifies its ProviderRole
 *    (CHAT, ACTION_RESOLVER, PLANNER, REPLANNER, FINALIZER). Direct vendor coupling is forbidden.
 * 2. Circuit Breaker & Cooldown: Consecutive failures or transient errors (429, 503, timeout)
 *    trigger an automatic cooldown window (default 30s) and seamless failover to the configured fallback.
 * 3. Deadline Propagation: The TurnDeadline is injected into every adapter call via child AbortSignals.
 * 4. Zero Model Authority: Models cannot invoke tools or authorize executions.
 */

import { z } from "zod"
import type {
  ModelAdapter,
  ModelRequestOptions,
  ModelResponse,
  ObjectGenerationResult,
  ProviderHealthStatus,
  ProviderMetrics,
  ProviderRole,
  RoleRoutingConfig,
} from "./types"

export interface ProviderRoleRouterOptions {
  readonly defaultCooldownMs?: number
  readonly maxConsecutiveErrorsBeforeCooldown?: number
}

interface InternalMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  consecutiveErrors: number
  lastSuccessAt?: number
  lastFailureAt?: number
  lastError?: string
  cooldownUntil?: number
  recentLatencies: number[]
}

export class ProviderRoleRouter {
  private readonly adapters = new Map<string, ModelAdapter>()
  private readonly roleConfigs = new Map<ProviderRole, RoleRoutingConfig>()
  private readonly metrics = new Map<string, InternalMetrics>()
  private readonly defaultCooldownMs: number
  private readonly maxConsecutiveErrors: number

  constructor(options?: ProviderRoleRouterOptions) {
    this.defaultCooldownMs = options?.defaultCooldownMs ?? 30_000
    this.maxConsecutiveErrors = options?.maxConsecutiveErrorsBeforeCooldown ?? 2
  }

  /**
   * Register a model adapter with the router.
   */
  public registerAdapter(adapter: ModelAdapter): this {
    this.adapters.set(adapter.providerId, adapter)
    if (!this.metrics.has(adapter.providerId)) {
      this.metrics.set(adapter.providerId, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        consecutiveErrors: 0,
        recentLatencies: [],
      })
    }
    return this
  }

  /**
   * Retrieve a registered model adapter by providerId.
   */
  public getAdapter(providerId: string): ModelAdapter | undefined {
    return this.adapters.get(providerId)
  }

  /**
   * List all registered model adapters.
   */
  public getRegisteredAdapters(): ReadonlyArray<ModelAdapter> {
    return Array.from(this.adapters.values())
  }

  /**
   * Configure routing for a specific ProviderRole.
   */
  public configureRole(config: RoleRoutingConfig): this {
    this.roleConfigs.set(config.role, config)
    return this
  }

  /**
   * Retrieve configuration for a role.
   */
  public getRoleConfig(role: ProviderRole): RoleRoutingConfig | undefined {
    return this.roleConfigs.get(role)
  }

  /**
   * Get current health status for a provider.
   */
  public getProviderHealth(providerId: string): ProviderHealthStatus {
    const adapter = this.adapters.get(providerId)
    if (!adapter || !adapter.isAvailable()) {
      return "OFFLINE"
    }

    const metric = this.metrics.get(providerId)
    if (!metric) return "HEALTHY"

    const now = Date.now()
    if (metric.cooldownUntil && metric.cooldownUntil > now) {
      return "COOLDOWN"
    }

    if (metric.consecutiveErrors > 0) {
      return "DEGRADED"
    }

    return "HEALTHY"
  }

  /**
   * Retrieve snapshot of provider metrics.
   */
  public getProviderMetrics(providerId: string): ProviderMetrics {
    const m = this.metrics.get(providerId) ?? {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      consecutiveErrors: 0,
      recentLatencies: [],
    }

    return {
      totalRequests: m.totalRequests,
      successfulRequests: m.successfulRequests,
      failedRequests: m.failedRequests,
      consecutiveErrors: m.consecutiveErrors,
      lastSuccessAt: m.lastSuccessAt,
      lastFailureAt: m.lastFailureAt,
      lastError: m.lastError,
      cooldownUntil: m.cooldownUntil,
      p50LatencyMs: this.computeP50(m.recentLatencies),
    }
  }

  /**
   * Force a provider into cooldown.
   */
  public setCooldown(providerId: string, durationMs?: number): void {
    const duration = durationMs ?? this.defaultCooldownMs
    const m = this.getOrCreateMetrics(providerId)
    m.cooldownUntil = Date.now() + duration
  }

  /**
   * Clear cooldown for a provider.
   */
  public clearCooldown(providerId: string): void {
    const m = this.metrics.get(providerId)
    if (m) {
      m.cooldownUntil = undefined
      m.consecutiveErrors = 0
    }
  }

  /**
   * Generate text for a given ProviderRole with automatic failover and deadline enforcement.
   */
  public async generateText(
    role: ProviderRole,
    prompt: string,
    options?: ModelRequestOptions
  ): Promise<ModelResponse> {
    const config = this.getResolvedRoleConfig(role)
    const { primaryAdapter, fallbackAdapter } = this.resolveAdaptersForRole(config)

    // Check turn deadline
    options?.deadline?.assertNotExpired(`generateText(${role})`)
    const childSignal = options?.deadline?.createChildSignal(options?.signal) ?? options?.signal

    const mergedOptions: ModelRequestOptions = {
      ...options,
      signal: childSignal,
      temperature: options?.temperature ?? config.temperature,
      maxTokens: options?.maxTokens ?? config.maxTokens,
    }

    const primaryHealth = this.getProviderHealth(primaryAdapter.providerId)
    const primaryUsable = primaryHealth === "HEALTHY" || primaryHealth === "DEGRADED"

    if (primaryUsable) {
      try {
        const response = await primaryAdapter.generateText(prompt, {
          ...mergedOptions,
          modelOverride: mergedOptions.modelOverride ?? config.primaryModel,
        })
        this.recordSuccess(primaryAdapter.providerId, response.latencyMs)
        return response
      } catch (error: any) {
        this.recordFailure(primaryAdapter.providerId, error)
        if (!fallbackAdapter) {
          throw error
        }
        // Fallback to secondary provider
      }
    }

    // Attempt fallback
    if (!fallbackAdapter) {
      throw new Error(
        `Primary provider "${primaryAdapter.providerId}" for role "${role}" is unusable (${primaryHealth}) and no fallback configured.`
      )
    }

    const fallbackHealth = this.getProviderHealth(fallbackAdapter.providerId)
    if (fallbackHealth === "OFFLINE" || fallbackHealth === "COOLDOWN") {
      throw new Error(
        `Both primary "${primaryAdapter.providerId}" (${primaryHealth}) and fallback "${fallbackAdapter.providerId}" (${fallbackHealth}) are unusable for role "${role}".`
      )
    }

    try {
      const response = await fallbackAdapter.generateText(prompt, {
        ...mergedOptions,
        modelOverride: mergedOptions.modelOverride ?? config.fallbackModel ?? config.primaryModel,
      })
      this.recordSuccess(fallbackAdapter.providerId, response.latencyMs)
      return response
    } catch (fallbackError: any) {
      this.recordFailure(fallbackAdapter.providerId, fallbackError)
      throw fallbackError
    }
  }

  /**
   * Generate structured object conforming to a Zod schema for a given ProviderRole.
   */
  public async generateObject<T>(
    role: ProviderRole,
    prompt: string,
    schema: z.ZodType<T>,
    options?: ModelRequestOptions
  ): Promise<ObjectGenerationResult<T>> {
    const config = this.getResolvedRoleConfig(role)
    const { primaryAdapter, fallbackAdapter } = this.resolveAdaptersForRole(config)

    options?.deadline?.assertNotExpired(`generateObject(${role})`)
    const childSignal = options?.deadline?.createChildSignal(options?.signal) ?? options?.signal

    const mergedOptions: ModelRequestOptions = {
      ...options,
      signal: childSignal,
      temperature: options?.temperature ?? config.temperature,
      maxTokens: options?.maxTokens ?? config.maxTokens,
    }

    const primaryHealth = this.getProviderHealth(primaryAdapter.providerId)
    const primaryUsable = primaryHealth === "HEALTHY" || primaryHealth === "DEGRADED"

    if (primaryUsable) {
      try {
        const result = await primaryAdapter.generateObject(prompt, schema, {
          ...mergedOptions,
          modelOverride: mergedOptions.modelOverride ?? config.primaryModel,
        })
        this.recordSuccess(primaryAdapter.providerId, result.response.latencyMs)
        return result
      } catch (error: any) {
        this.recordFailure(primaryAdapter.providerId, error)
        if (!fallbackAdapter) {
          throw error
        }
      }
    }

    // Attempt fallback
    if (!fallbackAdapter) {
      throw new Error(
        `Primary provider "${primaryAdapter.providerId}" for role "${role}" is unusable (${primaryHealth}) and no fallback configured.`
      )
    }

    const fallbackHealth = this.getProviderHealth(fallbackAdapter.providerId)
    if (fallbackHealth === "OFFLINE" || fallbackHealth === "COOLDOWN") {
      throw new Error(
        `Both primary "${primaryAdapter.providerId}" (${primaryHealth}) and fallback "${fallbackAdapter.providerId}" (${fallbackHealth}) are unusable for role "${role}".`
      )
    }

    try {
      const result = await fallbackAdapter.generateObject(prompt, schema, {
        ...mergedOptions,
        modelOverride: mergedOptions.modelOverride ?? config.fallbackModel ?? config.primaryModel,
      })
      this.recordSuccess(fallbackAdapter.providerId, result.response.latencyMs)
      return result
    } catch (fallbackError: any) {
      this.recordFailure(fallbackAdapter.providerId, fallbackError)
      throw fallbackError
    }
  }

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  private getResolvedRoleConfig(role: ProviderRole): RoleRoutingConfig {
    const explicit = this.roleConfigs.get(role)
    if (explicit) return explicit

    // Fall back to first registered adapter if available
    const firstAdapter = this.adapters.values().next().value
    if (!firstAdapter) {
      throw new Error(`No adapters registered in ProviderRoleRouter. Cannot resolve role "${role}".`)
    }

    return {
      role,
      primaryProvider: firstAdapter.providerId,
      primaryModel: "default",
    }
  }

  private resolveAdaptersForRole(config: RoleRoutingConfig): {
    primaryAdapter: ModelAdapter
    fallbackAdapter?: ModelAdapter
  } {
    const primaryAdapter = this.adapters.get(config.primaryProvider)
    if (!primaryAdapter) {
      throw new Error(
        `Configured primary provider "${config.primaryProvider}" for role "${config.role}" is not registered.`
      )
    }

    const fallbackAdapter = config.fallbackProvider
      ? this.adapters.get(config.fallbackProvider)
      : undefined

    return { primaryAdapter, fallbackAdapter }
  }

  private getOrCreateMetrics(providerId: string): InternalMetrics {
    let m = this.metrics.get(providerId)
    if (!m) {
      m = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        consecutiveErrors: 0,
        recentLatencies: [],
      }
      this.metrics.set(providerId, m)
    }
    return m
  }

  private recordSuccess(providerId: string, latencyMs: number): void {
    const m = this.getOrCreateMetrics(providerId)
    m.totalRequests += 1
    m.successfulRequests += 1
    m.consecutiveErrors = 0
    m.lastSuccessAt = Date.now()
    m.cooldownUntil = undefined
    m.recentLatencies.push(latencyMs)
    if (m.recentLatencies.length > 50) {
      m.recentLatencies.shift()
    }
  }

  private recordFailure(providerId: string, error: any): void {
    const m = this.getOrCreateMetrics(providerId)
    const now = Date.now()
    m.totalRequests += 1
    m.failedRequests += 1
    m.consecutiveErrors += 1
    m.lastFailureAt = now
    m.lastError = error?.message ?? String(error)

    // Trigger cooldown on consecutive errors or rate limit/503 indicators
    const errorMessage = (error?.message || "").toLowerCase()
    const isTransient =
      errorMessage.includes("429") ||
      errorMessage.includes("rate limit") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("503") ||
      errorMessage.includes("timeout")

    if (m.consecutiveErrors >= this.maxConsecutiveErrors || isTransient) {
      m.cooldownUntil = now + this.defaultCooldownMs
    }
  }

  private computeP50(latencies: number[]): number {
    if (latencies.length === 0) return 0
    const sorted = [...latencies].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted[mid]
  }
}
