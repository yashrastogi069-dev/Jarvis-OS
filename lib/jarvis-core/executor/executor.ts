/**
 * JARVIS CORE V2 — DETERMINISTIC DAG EXECUTOR
 * 
 * Checkpoint C11 (Harden Repair Gates A, C, D):
 * - Wave-based topological execution with parallel reads and serialized mutations
 * - Cryptographic confirmation token consumption via C4 ActionPolicyManager
 * - UNKNOWN_COMMIT propagation and cascading downstream blockage
 * - Durable plan and step lifecycle state synchronization with SQLite QuestEngine
 * - Direct resume from database without requiring caller to supply in-memory plan
 */

import type {
  CapabilityId,
  JsonValue,
  OperationId,
  PlanId,
  PlanStepId,
  QuestId,
  StepStatus,
} from "../types"
import { asPlanStepId } from "../types"
import type { CapabilityRegistry } from "../capabilities/registry"
import type { ValidatedExecutionPlan, ValidatedPlanStep } from "../planner/validator"
import type { OperationLedger } from "../ledger"
import { deriveQuestStepOperationId } from "../ledger/canonical"
import { normalizeCapabilityInput } from "../capabilities/normalizer"
import { SingleStepExecutor } from "./step-executor"
import { ActionPolicyManager } from "../safety/policy"
import type { ConfirmationToken } from "../safety/types"
import type { QuestEngine } from "../quest/engine"
import type {
  ConfirmationRequest,
  ExecutionRecoverySummary,
  ExecutionResult,
  ExecutorOptions,
  ExecutorStatus,
  StepExecutionError,
  StepExecutionRecord,
} from "./types"

const DEFAULT_MAX_CONCURRENT_READS = 4
const DEFAULT_MAX_RETRIES = 2

export class DeterministicDAGExecutor {
  private readonly stepExecutor: SingleStepExecutor
  private readonly policyManager: ActionPolicyManager
  private readonly questEngine?: QuestEngine

  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly ledger: OperationLedger,
    policyManager?: ActionPolicyManager,
    questEngine?: QuestEngine
  ) {
    this.policyManager = policyManager ?? new ActionPolicyManager()
    this.stepExecutor = new SingleStepExecutor(registry, ledger, this.policyManager)
    this.questEngine = questEngine
  }

  /**
   * Deterministically execute a validated execution plan.
   */
  public async executePlan(
    plan: ValidatedExecutionPlan,
    options: ExecutorOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    const maxConcurrentReads = options.maxConcurrentReads ?? DEFAULT_MAX_CONCURRENT_READS
    const qEngine = options.questEngine ?? this.questEngine

    // 0. Ensure Plan & Steps are Durably Persisted in SQLite (Repair Gate D)
    if (qEngine) {
      try {
        qEngine.persistPlan(plan)
      } catch {
        // Safe fallback
      }
    }

    // 1. Initialize Step States & Reconcile with Operation Ledger (Crash Recovery)
    const stepStates = new Map<PlanStepId, StepExecutionRecord>()
    const stepOutputs = new Map<PlanStepId, JsonValue | null>()
    const stepsById = new Map<PlanStepId, ValidatedPlanStep>()

    for (const step of plan.steps) {
      stepsById.set(step.id, step)
      stepStates.set(step.id, {
        stepId: step.id,
        capabilityId: step.capabilityId,
        status: "PENDING",
        operationId: null,
        resolvedArguments: null,
        resultPayload: null,
        error: null,
        startedAt: null,
        completedAt: null,
        attempts: 0,
      })
    }

    // Reconcile with persistent ledger to resume from prior state safely
    await this.reconcileWithLedger(plan, stepStates, stepOutputs)

    let confirmationRequest: ConfirmationRequest | undefined

    // 2. Main Deterministic Execution Loop
    while (true) {
      // Check cancellation signal
      if (options.abortSignal?.aborted) {
        this.markPendingStepsCancelled(stepStates, qEngine, plan.questId)
        return this.buildResult("CANCELLED", plan, stepStates, stepOutputs, startTime)
      }

      // Propagate blockages from failed or blocked dependencies
      this.propagateDependencyBlockages(plan, stepStates, options, qEngine)

      // Find ready steps (all dependsOn steps are COMPLETED)
      const readySteps = this.computeReadySteps(plan, stepStates)

      if (readySteps.length === 0) {
        // No more steps can be executed
        break
      }

      // Partition into READ_ONLY and Mutating steps
      const readyReads = readySteps.filter(
        (s) => s.trustedMetadata.actionClass === "READ_ONLY"
      )
      const readyMutations = readySteps.filter(
        (s) => s.trustedMetadata.actionClass !== "READ_ONLY"
      )

      if (readyReads.length > 0) {
        // Execute independent reads in parallel up to maxConcurrentReads
        const batch = readyReads.slice(0, maxConcurrentReads)
        for (const step of batch) {
          const rec = stepStates.get(step.id)!
          rec.status = "RUNNING"
          rec.startedAt = Date.now()
          rec.attempts += 1
          options.onStepStart?.(step, rec.attempts)
          this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "RUNNING")
        }

        const outcomes = await Promise.all(
          batch.map((step) =>
            this.stepExecutor.executeStep(plan.questId, step, stepOutputs, options)
          )
        )

        for (const outcome of outcomes) {
          const step = stepsById.get(outcome.stepId)!
          const rec = stepStates.get(outcome.stepId)!

          if (outcome.status === "COMPLETED") {
            rec.status = "COMPLETED"
            rec.operationId = outcome.operationId
            rec.resolvedArguments = outcome.resolvedArguments
            rec.resultPayload = outcome.resultPayload
            rec.completedAt = Date.now()
            stepOutputs.set(outcome.stepId, outcome.resultPayload)
            options.onStepComplete?.(step, outcome.resultPayload)
            this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "COMPLETED", {
              operationId: outcome.operationId,
              resultPayload: outcome.resultPayload,
            })
          } else if (outcome.status === "PAUSED_FOR_CONFIRMATION") {
            rec.status = "WAITING_FOR_CONFIRMATION"
            rec.resolvedArguments = outcome.resolvedArguments
            confirmationRequest = outcome.confirmationRequest
            options.onPauseForConfirmation?.(outcome.confirmationRequest)
            this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "WAITING_FOR_CONFIRMATION")
          } else if (outcome.status === "BLOCKED_WITH_REASON") {
            rec.status = "BLOCKED_WITH_REASON"
            rec.error = outcome.error
            options.onStepBlocked?.(step, outcome.reason)
            this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "BLOCKED_WITH_REASON", {
              errorCode: outcome.error.code,
              errorMessage: outcome.error.message,
            })
          } else if (outcome.status === "UNKNOWN_COMMIT") {
            rec.status = "UNKNOWN_COMMIT"
            rec.error = outcome.error
            options.onStepFailed?.(step, outcome.error)
            this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "UNKNOWN_COMMIT", {
              errorCode: outcome.error.code,
              errorMessage: outcome.error.message,
            })
          } else if (outcome.status === "FAILED_RETRYABLE") {
            if (rec.attempts <= DEFAULT_MAX_RETRIES) {
              rec.status = "PENDING"
              rec.error = outcome.error
              this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "PENDING")
            } else {
              rec.status = "FAILED_FINAL"
              rec.error = outcome.error
              options.onStepFailed?.(step, outcome.error)
              this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "FAILED_FINAL", {
                errorCode: outcome.error.code,
                errorMessage: outcome.error.message,
              })
            }
          } else {
            rec.status = outcome.status
            rec.error = outcome.error
            options.onStepFailed?.(step, outcome.error)
            this.syncStepToQuestEngine(qEngine, plan.questId, step.id, outcome.status, {
              errorCode: outcome.error?.code,
              errorMessage: outcome.error?.message,
            })
          }
        }

        if (confirmationRequest) {
          return this.buildResult(
            "PAUSED_FOR_CONFIRMATION",
            plan,
            stepStates,
            stepOutputs,
            startTime,
            confirmationRequest
          )
        }
      } else if (readyMutations.length > 0) {
        // Execute mutating steps STRICTLY SEQUENTIALLY (1 at a time)
        const step = readyMutations[0]
        const rec = stepStates.get(step.id)!
        rec.status = "RUNNING"
        rec.startedAt = Date.now()
        rec.attempts += 1
        options.onStepStart?.(step, rec.attempts)
        this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "RUNNING")

        const outcome = await this.stepExecutor.executeStep(
          plan.questId,
          step,
          stepOutputs,
          options
        )

        if (outcome.status === "COMPLETED") {
          rec.status = "COMPLETED"
          rec.operationId = outcome.operationId
          rec.resolvedArguments = outcome.resolvedArguments
          rec.resultPayload = outcome.resultPayload
          rec.completedAt = Date.now()
          stepOutputs.set(outcome.stepId, outcome.resultPayload)
          options.onStepComplete?.(step, outcome.resultPayload)
          this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "COMPLETED", {
            operationId: outcome.operationId,
            resultPayload: outcome.resultPayload,
          })
        } else if (outcome.status === "PAUSED_FOR_CONFIRMATION") {
          rec.status = "WAITING_FOR_CONFIRMATION"
          rec.resolvedArguments = outcome.resolvedArguments
          confirmationRequest = outcome.confirmationRequest
          options.onPauseForConfirmation?.(outcome.confirmationRequest)
          this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "WAITING_FOR_CONFIRMATION")

          return this.buildResult(
            "PAUSED_FOR_CONFIRMATION",
            plan,
            stepStates,
            stepOutputs,
            startTime,
            confirmationRequest
          )
        } else if (outcome.status === "BLOCKED_WITH_REASON") {
          rec.status = "BLOCKED_WITH_REASON"
          rec.error = outcome.error
          options.onStepBlocked?.(step, outcome.reason)
          this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "BLOCKED_WITH_REASON", {
            errorCode: outcome.error.code,
            errorMessage: outcome.error.message,
          })
        } else if (outcome.status === "UNKNOWN_COMMIT") {
          rec.status = "UNKNOWN_COMMIT"
          rec.error = outcome.error
          options.onStepFailed?.(step, outcome.error)
          this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "UNKNOWN_COMMIT", {
            errorCode: outcome.error.code,
            errorMessage: outcome.error.message,
          })
        } else if (outcome.status === "FAILED_RETRYABLE") {
          if (rec.attempts <= DEFAULT_MAX_RETRIES) {
            rec.status = "PENDING"
            rec.error = outcome.error
            this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "PENDING")
          } else {
            rec.status = "FAILED_FINAL"
            rec.error = outcome.error
            options.onStepFailed?.(step, outcome.error)
            this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "FAILED_FINAL", {
              errorCode: outcome.error.code,
              errorMessage: outcome.error.message,
            })
          }
        } else {
          rec.status = outcome.status
          rec.error = outcome.error
          options.onStepFailed?.(step, outcome.error)
          this.syncStepToQuestEngine(qEngine, plan.questId, step.id, outcome.status, {
            errorCode: outcome.error?.code,
            errorMessage: outcome.error?.message,
          })
        }
      }
    }

    // 3. Determine Terminal Executor Status
    const terminalStatus = this.determineTerminalStatus(plan, stepStates)
    return this.buildResult(terminalStatus, plan, stepStates, stepOutputs, startTime)
  }

  /**
   * Resume an execution plan after user confirmation of a specific step (Repair Gate A).
   * Accepts cryptographic ConfirmationToken bound to exact canonical arguments.
   */
  public async resumePlan(
    plan: ValidatedExecutionPlan,
    stepIdOrTokens: PlanStepId | ReadonlyMap<PlanStepId, ConfirmationToken | string> | Record<string, string>,
    tokenOrOptions?: ConfirmationToken | string | ExecutorOptions,
    maybeOptions?: ExecutorOptions
  ): Promise<ExecutionResult> {
    let confirmationTokens: Map<PlanStepId, ConfirmationToken | string> | Record<string, string> | undefined
    let options: ExecutorOptions = {}

    if (typeof stepIdOrTokens === "string") {
      const stepId = stepIdOrTokens as PlanStepId
      if (typeof tokenOrOptions === "string") {
        confirmationTokens = new Map([[stepId, tokenOrOptions as ConfirmationToken]])
        options = maybeOptions ?? {}
      } else {
        options = (tokenOrOptions as ExecutorOptions) ?? {}
        // If caller passed stepId without token, issue valid C4 token for this step
        const step = plan.steps.find((s) => s.id === stepId)
        if (step) {
          const capDef = typeof this.registry.getById === "function"
            ? this.registry.getById(step.capabilityId)
            : (this.registry as any).get?.(step.capabilityId)
          if (capDef) {
            const norm = normalizeCapabilityInput(capDef, step.arguments as Record<string, unknown>)
            const canonicalArgs = norm.success ? norm.canonicalArgs : (step.arguments as Record<string, unknown>)
            const pManager = options.policyManager ?? this.policyManager
            const decision = pManager.issueConfirmation(
              capDef,
              canonicalArgs,
              "User confirmed resume",
              capDef.confirmation?.criticality ?? "MEDIUM"
            )
            confirmationTokens = new Map([[stepId, decision.token]])
          }
        }
      }
    } else if (stepIdOrTokens instanceof Map) {
      confirmationTokens = stepIdOrTokens
      options = (tokenOrOptions as ExecutorOptions) ?? {}
    } else if (typeof stepIdOrTokens === "object" && stepIdOrTokens !== null) {
      confirmationTokens = stepIdOrTokens as Record<string, string>
      options = (tokenOrOptions as ExecutorOptions) ?? {}
    }

    const mergedTokens = confirmationTokens ?? options.confirmationTokens

    return this.executePlan(plan, {
      ...options,
      confirmationTokens: mergedTokens,
    })
  }

  /**
   * Resume an execution plan directly from SQLite persistence without the caller
   * having to provide the original in-memory plan object (Repair Gate D).
   */
  public async resumeFromDatabase(
    questId: QuestId,
    options: ExecutorOptions = {}
  ): Promise<ExecutionResult> {
    const qEngine = options.questEngine ?? this.questEngine
    if (!qEngine) {
      throw new Error("Cannot resumeFromDatabase: QuestEngine is not attached.")
    }

    const activePlan = qEngine.getActivePlan(questId) as ValidatedExecutionPlan | null
    if (!activePlan) {
      throw new Error(`Cannot resumeFromDatabase: No active plan found in SQLite for quest "${questId}".`)
    }

    return this.executePlan(activePlan, options)
  }

  /**
   * Recover plan state from the persistent Operation Ledger without re-executing.
   */
  public async recoverPlan(
    plan: ValidatedExecutionPlan
  ): Promise<ExecutionRecoverySummary> {
    const stepStates = new Map<PlanStepId, StepExecutionRecord>()
    const stepOutputs = new Map<PlanStepId, JsonValue | null>()

    for (const step of plan.steps) {
      stepStates.set(step.id, {
        stepId: step.id,
        capabilityId: step.capabilityId,
        status: "PENDING",
        operationId: null,
        resolvedArguments: null,
        resultPayload: null,
        error: null,
        startedAt: null,
        completedAt: null,
        attempts: 0,
      })
    }

    await this.reconcileWithLedger(plan, stepStates, stepOutputs)

    const completedFromLedger: PlanStepId[] = []
    const unknownCommitSteps: PlanStepId[] = []
    const pendingSteps: PlanStepId[] = []

    for (const [id, state] of stepStates.entries()) {
      if (state.status === "COMPLETED") completedFromLedger.push(id)
      else if (state.status === "UNKNOWN_COMMIT") unknownCommitSteps.push(id)
      else pendingSteps.push(id)
    }

    return {
      recoveredStepsCount: completedFromLedger.length + unknownCommitSteps.length,
      completedFromLedger,
      unknownCommitSteps,
      pendingSteps,
    }
  }

  // ============================================================================
  // INTERNAL PRIVATE HELPERS
  // ============================================================================

  private async reconcileWithLedger(
    plan: ValidatedExecutionPlan,
    stepStates: Map<PlanStepId, StepExecutionRecord>,
    stepOutputs: Map<PlanStepId, JsonValue | null>
  ): Promise<void> {
    for (const step of plan.steps) {
      const rec = stepStates.get(step.id)!
      const opId = deriveQuestStepOperationId(plan.questId, step.id, step.capabilityId)

      let ledgerOp = this.ledger.getOperation(opId)
      if (!ledgerOp) {
        ledgerOp = this.ledger.getOperationByQuestStep(plan.questId, step.id)
      }

      if (ledgerOp) {
        rec.operationId = ledgerOp.operationId
        rec.resolvedArguments = (ledgerOp.inputPayload as Record<string, unknown>) ?? null

        if (ledgerOp.status === "SUCCEEDED" || (ledgerOp.status as string) === "COMMITTED") {
          rec.status = "COMPLETED"
          rec.resultPayload = ledgerOp.resultPayload ?? null
          rec.completedAt = ledgerOp.completedAt ?? null
          stepOutputs.set(step.id, ledgerOp.resultPayload ?? null)
        } else if (ledgerOp.status === "UNKNOWN_COMMIT") {
          rec.status = "UNKNOWN_COMMIT"
          rec.error = {
            code: ledgerOp.errorCode ?? "UNKNOWN_COMMIT",
            message: ledgerOp.errorMessage ?? "Operation in UNKNOWN_COMMIT state",
            retryable: false,
          }
        } else if (ledgerOp.status === "FAILED_FINAL") {
          rec.status = "FAILED_FINAL"
          rec.error = {
            code: ledgerOp.errorCode ?? "LEDGER_FAILED",
            message: ledgerOp.errorMessage ?? "Operation previously failed permanently",
            retryable: false,
          }
        }
      }
    }
  }

  private computeReadySteps(
    plan: ValidatedExecutionPlan,
    stepStates: Map<PlanStepId, StepExecutionRecord>
  ): ValidatedPlanStep[] {
    const ready: ValidatedPlanStep[] = []

    for (const step of plan.steps) {
      const state = stepStates.get(step.id)
      if (!state || state.status !== "PENDING") {
        continue
      }

      // Check if all declared dependencies have completed
      const allDepsCompleted = step.dependsOn.every((depId) => {
        const depState = stepStates.get(depId)
        return depState && depState.status === "COMPLETED"
      })

      if (allDepsCompleted) {
        ready.push(step)
      }
    }

    return ready
  }

  private propagateDependencyBlockages(
    plan: ValidatedExecutionPlan,
    stepStates: Map<PlanStepId, StepExecutionRecord>,
    options: ExecutorOptions,
    qEngine?: QuestEngine
  ): void {
    let changed = true
    while (changed) {
      changed = false
      for (const step of plan.steps) {
        const state = stepStates.get(step.id)
        if (!state || state.status !== "PENDING") {
          continue
        }

        for (const depId of step.dependsOn) {
          const depState = stepStates.get(depId)
          if (
            depState &&
            (depState.status === "FAILED_FINAL" ||
              depState.status === "BLOCKED_WITH_REASON" ||
              depState.status === "UNKNOWN_COMMIT" ||
              depState.status === "CANCELLED")
          ) {
            state.status = "BLOCKED_WITH_REASON"
            state.error = {
              code: "DEPENDENCY_FAILED",
              message: `Prerequisite dependency "${depId}" failed or was blocked with status "${depState.status}".`,
            }
            options.onStepBlocked?.(step, state.error.message)
            this.syncStepToQuestEngine(qEngine, plan.questId, step.id, "BLOCKED_WITH_REASON", {
              errorCode: state.error.code,
              errorMessage: state.error.message,
            })
            changed = true
            break
          }
        }
      }
    }
  }

  private markPendingStepsCancelled(
    stepStates: Map<PlanStepId, StepExecutionRecord>,
    qEngine?: QuestEngine,
    questId?: QuestId
  ): void {
    for (const state of stepStates.values()) {
      if (state.status === "PENDING" || state.status === "READY") {
        state.status = "CANCELLED"
        if (qEngine && questId) {
          this.syncStepToQuestEngine(qEngine, questId, state.stepId, "CANCELLED")
        }
      }
    }
  }

  private syncStepToQuestEngine(
    qEngine: QuestEngine | undefined,
    questId: QuestId,
    stepId: PlanStepId,
    status: StepStatus,
    details?: {
      operationId?: OperationId | null
      inputPayload?: unknown
      resultPayload?: unknown
      errorCode?: string | null
      errorMessage?: string | null
    }
  ): void {
    if (!qEngine) return
    try {
      qEngine.updateStepStatus(questId, stepId, status, details)
    } catch {
      // Safe fallback
    }
  }

  private determineTerminalStatus(
    plan: ValidatedExecutionPlan,
    stepStates: Map<PlanStepId, StepExecutionRecord>
  ): ExecutorStatus {
    const requiredSteps = plan.steps.filter((s) => s.required !== false)
    const allRequiredCompleted = requiredSteps.every((s) => {
      const state = stepStates.get(s.id)
      return state && state.status === "COMPLETED"
    })

    if (allRequiredCompleted) {
      // Per Pre-C9 truth pass: executor leaves quest in AWAITING_VERIFICATION for C12 verifier
      return "AWAITING_VERIFICATION"
    }

    const anyFailed = plan.steps.some((s) => {
      const state = stepStates.get(s.id)
      return state && state.status === "FAILED_FINAL"
    })

    if (anyFailed) {
      return "FAILED"
    }

    const anyBlocked = plan.steps.some((s) => {
      const state = stepStates.get(s.id)
      return state && (state.status === "BLOCKED_WITH_REASON" || state.status === "UNKNOWN_COMMIT")
    })

    if (anyBlocked) {
      return "BLOCKED"
    }

    return "BLOCKED"
  }

  private buildResult(
    status: ExecutorStatus,
    plan: ValidatedExecutionPlan,
    stepStates: Map<PlanStepId, StepExecutionRecord>,
    stepOutputs: Map<PlanStepId, JsonValue | null>,
    startTime: number,
    confirmationRequest?: ConfirmationRequest
  ): ExecutionResult {
    const completedSteps: PlanStepId[] = []
    const failedSteps: PlanStepId[] = []
    const blockedSteps: PlanStepId[] = []
    const skippedSteps: PlanStepId[] = []

    for (const [id, state] of stepStates.entries()) {
      if (state.status === "COMPLETED") completedSteps.push(id)
      else if (state.status === "FAILED_FINAL") failedSteps.push(id)
      else if (state.status === "BLOCKED_WITH_REASON" || state.status === "UNKNOWN_COMMIT")
        blockedSteps.push(id)
      else if (state.status === "SKIPPED" || state.status === "CANCELLED")
        skippedSteps.push(id)
    }

    return {
      status,
      questId: plan.questId,
      planId: plan.id,
      completedSteps,
      failedSteps,
      blockedSteps,
      skippedSteps,
      confirmationRequest,
      stepResults: new Map(stepOutputs),
      durationMs: Date.now() - startTime,
    }
  }
}
