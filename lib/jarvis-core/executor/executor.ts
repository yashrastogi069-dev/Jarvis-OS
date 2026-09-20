/**
 * JARVIS CORE V2 — DETERMINISTIC DAG EXECUTOR
 * 
 * Checkpoint C11: Topological execution, parallel read concurrency, serial mutation,
 * confirmation pause/resume, Operation Ledger integration, and crash recovery.
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
import { SingleStepExecutor } from "./step-executor"
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

  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly ledger: OperationLedger
  ) {
    this.stepExecutor = new SingleStepExecutor(registry, ledger)
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
        this.markPendingStepsCancelled(stepStates)
        return this.buildResult("CANCELLED", plan, stepStates, stepOutputs, startTime)
      }

      // Propagate blockages from failed or blocked dependencies
      this.propagateDependencyBlockages(plan, stepStates, options)

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
          } else if (outcome.status === "PAUSED_FOR_CONFIRMATION") {
            rec.status = "WAITING_FOR_CONFIRMATION"
            rec.resolvedArguments = outcome.resolvedArguments
            confirmationRequest = outcome.confirmationRequest
            options.onPauseForConfirmation?.(outcome.confirmationRequest)
          } else if (outcome.status === "BLOCKED_WITH_REASON") {
            rec.status = "BLOCKED_WITH_REASON"
            rec.error = outcome.error
            options.onStepBlocked?.(step, outcome.reason)
          } else if (outcome.status === "FAILED_RETRYABLE") {
            if (rec.attempts <= DEFAULT_MAX_RETRIES) {
              rec.status = "PENDING"
              rec.error = outcome.error
            } else {
              rec.status = "FAILED_FINAL"
              rec.error = outcome.error
              options.onStepFailed?.(step, outcome.error)
            }
          } else {
            rec.status = outcome.status
            rec.error = outcome.error
            options.onStepFailed?.(step, outcome.error)
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
        } else if (outcome.status === "PAUSED_FOR_CONFIRMATION") {
          rec.status = "WAITING_FOR_CONFIRMATION"
          rec.resolvedArguments = outcome.resolvedArguments
          confirmationRequest = outcome.confirmationRequest
          options.onPauseForConfirmation?.(outcome.confirmationRequest)

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
        } else if (outcome.status === "FAILED_RETRYABLE") {
          if (rec.attempts <= DEFAULT_MAX_RETRIES) {
            rec.status = "PENDING"
            rec.error = outcome.error
          } else {
            rec.status = "FAILED_FINAL"
            rec.error = outcome.error
            options.onStepFailed?.(step, outcome.error)
          }
        } else {
          rec.status = outcome.status
          rec.error = outcome.error
          options.onStepFailed?.(step, outcome.error)
        }
      }
    }

    // 3. Determine Terminal Executor Status
    const terminalStatus = this.determineTerminalStatus(plan, stepStates)
    return this.buildResult(terminalStatus, plan, stepStates, stepOutputs, startTime)
  }

  /**
   * Resume an execution plan after user confirmation of a specific step.
   */
  public async resumePlan(
    plan: ValidatedExecutionPlan,
    confirmedStepId: PlanStepId,
    options: ExecutorOptions = {}
  ): Promise<ExecutionResult> {
    const existingConfirmed = options.confirmedSteps
      ? Array.from(options.confirmedSteps)
      : []
    const updatedConfirmed = Array.from(new Set([...existingConfirmed, confirmedStepId]))

    return this.executePlan(plan, {
      ...options,
      confirmedSteps: updatedConfirmed,
    })
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
  // INTERNAL SCHEDULER & RECONCILIATION HELPERS
  // ============================================================================

  private async reconcileWithLedger(
    plan: ValidatedExecutionPlan,
    stepStates: Map<PlanStepId, StepExecutionRecord>,
    stepOutputs: Map<PlanStepId, JsonValue | null>
  ): Promise<void> {
    for (const step of plan.steps) {
      const opId = deriveQuestStepOperationId(plan.questId, step.id, step.capabilityId)
      const opRecord =
        this.ledger.getOperation(opId) ??
        this.ledger.getOperationByQuestStep(plan.questId, step.id)

      if (opRecord) {
        const rec = stepStates.get(step.id)!
        rec.operationId = opId

        if (opRecord.status === "SUCCEEDED") {
          rec.status = "COMPLETED"
          rec.resultPayload = opRecord.resultPayload ?? null
          rec.completedAt = opRecord.completedAt ?? null
          stepOutputs.set(step.id, opRecord.resultPayload ?? null)
        } else if (opRecord.status === "UNKNOWN_COMMIT") {
          rec.status = "UNKNOWN_COMMIT"
          rec.error = {
            code: "LEDGER_UNKNOWN_COMMIT",
            message: opRecord.errorMessage ?? "Operation in UNKNOWN_COMMIT status.",
          }
        } else if (opRecord.status === "FAILED_FINAL") {
          rec.status = "FAILED_FINAL"
          rec.error = {
            code: opRecord.errorCode ?? "LEDGER_FAILURE",
            message: opRecord.errorMessage ?? "Operation failed permanently in ledger.",
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

      // Check all dependencies
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
    options: ExecutorOptions
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
            changed = true
            break
          }
        }
      }
    }
  }

  private markPendingStepsCancelled(
    stepStates: Map<PlanStepId, StepExecutionRecord>
  ): void {
    for (const state of stepStates.values()) {
      if (state.status === "PENDING" || state.status === "READY") {
        state.status = "CANCELLED"
      }
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
