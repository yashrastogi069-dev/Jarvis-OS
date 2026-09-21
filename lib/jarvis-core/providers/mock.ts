/**
 * JARVIS CORE V2 — DETERMINISTIC MOCK MODEL ADAPTER
 * 
 * Checkpoint: C14 (Section C14.3)
 * Status: Authoritative Zero-Network Offline Mock Provider Adapter
 * 
 * Invariants:
 * 1. 100% Offline & Deterministic: Zero external network requests; runs cleanly in any CI or sandbox.
 * 2. Canned Response Queue & Pattern Matching: Matches prompts against regex patterns or queued responses.
 * 3. Controllable Latency & Failures: Simulates delays, rate limits (429), timeouts, and 5xx errors
 *    for rigorous testing of router failover and circuit breaker dynamics.
 */

import { z } from "zod"
import type {
  ModelAdapter,
  ModelRequestOptions,
  ModelResponse,
  ObjectGenerationResult,
} from "./types"

export interface MockCallRecord {
  readonly prompt: string
  readonly options?: ModelRequestOptions
  readonly timestamp: number
}

export class MockModelAdapter implements ModelAdapter {
  public readonly providerId: string
  public readonly displayName: string

  private available: boolean = true
  private cannedResponses: Array<{ pattern?: RegExp | string; response: string }> = []
  private cannedObjects: Array<{ pattern?: RegExp | string; object: any }> = []
  private failureTrigger?: { error: Error; count?: number }
  private artificialDelayMs: number = 0
  private readonly callHistory: MockCallRecord[] = []

  constructor(providerId: string = "mock", displayName: string = "Mock Model Provider") {
    this.providerId = providerId
    this.displayName = displayName
  }

  public isAvailable(): boolean {
    return this.available
  }

  public setAvailable(available: boolean): this {
    this.available = available
    return this
  }

  public setArtificialDelay(delayMs: number): this {
    this.artificialDelayMs = delayMs
    return this
  }

  public enqueueResponse(response: string, pattern?: RegExp | string): this {
    this.cannedResponses.push({ pattern, response })
    return this
  }

  public enqueueObject(object: any, pattern?: RegExp | string): this {
    this.cannedObjects.push({ pattern, object })
    return this
  }

  public triggerError(error: Error, count: number = 1): this {
    this.failureTrigger = { error, count }
    return this
  }

  public clearTriggers(): this {
    this.failureTrigger = undefined
    this.cannedResponses = []
    this.cannedObjects = []
    return this
  }

  public getCallHistory(): ReadonlyArray<MockCallRecord> {
    return [...this.callHistory]
  }

  public clearCallHistory(): void {
    this.callHistory.length = 0
  }

  public async generateText(
    prompt: string,
    options?: ModelRequestOptions
  ): Promise<ModelResponse> {
    const startTime = Date.now()
    this.callHistory.push({ prompt, options, timestamp: startTime })

    // Check availability
    if (!this.available) {
      throw new Error(`Provider "${this.providerId}" is currently offline or unavailable.`)
    }

    // Check deadline / signal before running
    if (options?.signal?.aborted) {
      throw new Error(`Generation aborted: ${options.signal.reason || "signal aborted"}`)
    }
    options?.deadline?.assertNotExpired(`generateText(${this.providerId})`)

    // Simulate artificial delay if configured
    if (this.artificialDelayMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, this.artificialDelayMs)
        if (options?.signal) {
          options.signal.addEventListener("abort", () => {
            clearTimeout(timer)
            reject(new Error("Generation aborted during simulated delay."))
          }, { once: true })
        }
      })
    }

    // Check failure trigger
    if (this.failureTrigger && (this.failureTrigger.count ?? 1) > 0) {
      if (this.failureTrigger.count !== undefined) {
        this.failureTrigger.count -= 1
      }
      throw this.failureTrigger.error
    }

    // Match canned response
    let text = "Default mock response"
    const matchIdx = this.cannedResponses.findIndex((c) => {
      if (!c.pattern) return true
      if (typeof c.pattern === "string") return prompt.includes(c.pattern)
      return c.pattern.test(prompt)
    })

    if (matchIdx !== -1) {
      text = this.cannedResponses[matchIdx].response
      this.cannedResponses.splice(matchIdx, 1)
    }

    const latencyMs = Date.now() - startTime
    return {
      text,
      model: options?.modelOverride ?? "mock-model-v1",
      providerId: this.providerId,
      usage: {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: Math.ceil(text.length / 4),
        totalTokens: Math.ceil((prompt.length + text.length) / 4),
      },
      latencyMs,
    }
  }

  public async generateObject<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: ModelRequestOptions
  ): Promise<ObjectGenerationResult<T>> {
    const startTime = Date.now()
    this.callHistory.push({ prompt, options, timestamp: startTime })

    if (!this.available) {
      throw new Error(`Provider "${this.providerId}" is currently offline or unavailable.`)
    }

    if (options?.signal?.aborted) {
      throw new Error(`Object generation aborted: ${options.signal.reason || "signal aborted"}`)
    }
    options?.deadline?.assertNotExpired(`generateObject(${this.providerId})`)

    if (this.artificialDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.artificialDelayMs))
    }

    if (this.failureTrigger && (this.failureTrigger.count ?? 1) > 0) {
      if (this.failureTrigger.count !== undefined) {
        this.failureTrigger.count -= 1
      }
      throw this.failureTrigger.error
    }

    // Match canned object
    let matchedRaw: any = null
    const matchIdx = this.cannedObjects.findIndex((c) => {
      if (!c.pattern) return true
      if (typeof c.pattern === "string") return prompt.includes(c.pattern)
      return c.pattern.test(prompt)
    })

    if (matchIdx !== -1) {
      matchedRaw = this.cannedObjects[matchIdx].object
      this.cannedObjects.splice(matchIdx, 1)
    } else {
      // Attempt to parse text response as JSON if canned response was provided instead
      const textMatchIdx = this.cannedResponses.findIndex((c) => {
        if (!c.pattern) return true
        if (typeof c.pattern === "string") return prompt.includes(c.pattern)
        return c.pattern.test(prompt)
      })
      if (textMatchIdx !== -1) {
        try {
          matchedRaw = JSON.parse(this.cannedResponses[textMatchIdx].response)
          this.cannedResponses.splice(textMatchIdx, 1)
        } catch {}
      }
    }

    const parseResult = schema.safeParse(matchedRaw ?? {})
    if (!parseResult.success) {
      throw new Error(`Mock object generation failed schema validation: ${parseResult.error.message}`)
    }

    const latencyMs = Date.now() - startTime
    const textRepr = JSON.stringify(parseResult.data)

    return {
      object: parseResult.data,
      response: {
        text: textRepr,
        model: options?.modelOverride ?? "mock-model-v1",
        providerId: this.providerId,
        usage: {
          promptTokens: Math.ceil(prompt.length / 4),
          completionTokens: Math.ceil(textRepr.length / 4),
          totalTokens: Math.ceil((prompt.length + textRepr.length) / 4),
        },
        latencyMs,
      },
    }
  }
}
