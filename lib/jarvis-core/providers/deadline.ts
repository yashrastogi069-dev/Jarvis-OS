/**
 * JARVIS CORE V2 — GLOBAL TURN DEADLINE MODEL
 * 
 * Checkpoint: C14 (Section C14.2)
 * Status: Authoritative Global Turn Deadline Engine
 * 
 * Architectural Invariants:
 * 1. Single Global Turn Deadline: Exactly one deadline governs the entire user turn
 *    (default 60s, configurable). Stacked per-step timeouts that accumulate latency are FORBIDDEN.
 * 2. Dual-Threshold Model:
 *    - Hard Deadline: Request aborts unrecoverably (AbortSignal fires).
 *    - Soft Deadline: Triggers graceful finalization (e.g. 5s before hard deadline) so the
 *      system can synthesize a truthful partial response rather than crashing or dropping connection.
 * 3. Cooperative Signal Propagation: Child signals inherit both the remaining turn deadline
 *    and any caller-supplied client disconnect signals.
 */

export interface DeadlineCheckpoint {
  readonly stageName: string
  readonly elapsedMs: number
  readonly remainingMs: number
  readonly remainingSoftMs: number
  readonly isSoftExpired: boolean
  readonly isExpired: boolean
}

export class TurnDeadline {
  public readonly startedAt: number
  public readonly budgetMs: number
  public readonly softBufferMs: number
  public readonly hardDeadline: number
  public readonly softDeadline: number

  constructor(budgetMs: number = 60_000, softBufferMs: number = 5_000, startTime?: number) {
    if (budgetMs <= 0) throw new Error("TurnDeadline budgetMs must be greater than 0.")
    if (softBufferMs < 0 || softBufferMs >= budgetMs) {
      throw new Error(`TurnDeadline softBufferMs (${softBufferMs}ms) must be non-negative and less than budgetMs (${budgetMs}ms).`)
    }

    this.startedAt = startTime ?? Date.now()
    this.budgetMs = budgetMs
    this.softBufferMs = softBufferMs
    this.hardDeadline = this.startedAt + budgetMs
    this.softDeadline = this.hardDeadline - softBufferMs
  }

  /**
   * Has the hard turn deadline elapsed?
   */
  public isExpired(): boolean {
    return Date.now() >= this.hardDeadline
  }

  /**
   * Has the soft deadline elapsed? (Time to wrap up and synthesize final response)
   */
  public isSoftExpired(): boolean {
    return Date.now() >= this.softDeadline
  }

  /**
   * Remaining time until hard deadline in milliseconds (minimum 0).
   */
  public remainingMs(): number {
    return Math.max(0, this.hardDeadline - Date.now())
  }

  /**
   * Remaining time until soft deadline in milliseconds (minimum 0).
   */
  public remainingSoftMs(): number {
    return Math.max(0, this.softDeadline - Date.now())
  }

  /**
   * Elapsed time since turn started in milliseconds.
   */
  public elapsedMs(): number {
    return Date.now() - this.startedAt
  }

  /**
   * Asserts that the hard deadline has not been exceeded.
   * Throws a structured Error if exceeded.
   */
  public assertNotExpired(contextStage?: string): void {
    if (this.isExpired()) {
      const stageInfo = contextStage ? ` during [${contextStage}]` : ""
      const error: any = new Error(`Global turn deadline of ${this.budgetMs}ms exceeded${stageInfo}.`)
      error.code = "TIMEOUT"
      error.retryable = false
      throw error
    }
  }

  /**
   * Record a stage checkpoint with elapsed and remaining time.
   */
  public checkpoint(stageName: string): DeadlineCheckpoint {
    return {
      stageName,
      elapsedMs: this.elapsedMs(),
      remainingMs: this.remainingMs(),
      remainingSoftMs: this.remainingSoftMs(),
      isSoftExpired: this.isSoftExpired(),
      isExpired: this.isExpired(),
    }
  }

  /**
   * Create an AbortSignal that automatically triggers when the hard deadline expires,
   * or when the optional parent signal aborts.
   */
  public createChildSignal(parentSignal?: AbortSignal): AbortSignal {
    const controller = new AbortController()

    if (parentSignal?.aborted) {
      controller.abort(parentSignal.reason)
      return controller.signal
    }

    const remaining = this.remainingMs()
    if (remaining <= 0) {
      controller.abort(new Error(`Turn deadline of ${this.budgetMs}ms has expired.`))
      return controller.signal
    }

    const timer = setTimeout(() => {
      controller.abort(new Error(`Turn deadline of ${this.budgetMs}ms expired.`))
    }, remaining)

    // Unref timer in Node.js environment so it does not keep process alive
    if (typeof timer.unref === "function") {
      timer.unref()
    }

    if (parentSignal) {
      const onParentAbort = () => {
        clearTimeout(timer)
        controller.abort(parentSignal.reason)
      }
      parentSignal.addEventListener("abort", onParentAbort, { once: true })
      controller.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer)
          parentSignal.removeEventListener("abort", onParentAbort)
        },
        { once: true }
      )
    }

    return controller.signal
  }
}
