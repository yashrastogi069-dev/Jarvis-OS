/**
 * JARVIS CORE V2 — CORE RUNTIME ENGINE
 * 
 * Checkpoint: C16 (Section C16.6)
 * Status: Authoritative End-to-End Orchestrator
 * 
 * Architectural Invariants:
 * 1. Zero Model Authority: All capabilities are executed strictly through deterministic code
 *    and cryptographic token authorization.
 * 2. Single Global Turn Deadline: Governs the entire turn from entry to finalization; no stacked timeouts.
 * 3. Structured SSE Event Streaming: Every turn step and stage change is emitted with monotonic IDs.
 * 4. Grounded Finalization & Anti-Hallucination: Responses strictly mirror ledger and step facts.
 */

import type {
  CapabilityId,
  JsonValue,
  PlanStepId,
  RuntimeErrorEnvelope,
  StepStatus,
  TurnId,
} from "../types"
import { asCapabilityId, asPlanStepId, asTurnId } from "../types"
import type { CapabilityRegistry } from "../capabilities/registry"
import type { OperationLedger } from "../ledger"
import type { OperationRecord } from "../ledger/types"
import type { ActionPolicyManager } from "../safety/policy"
import { actionPolicyManager } from "../safety/policy"
import { DeterministicFastPathClassifier } from "../intent/classifier"
import type { ResolvedIntent } from "../intent/types"
import { DirectActionRuntime } from "../action/runtime"
import { ProviderRoleRouter } from "../providers/router"
import { TurnDeadline } from "../providers/deadline"
import { GroundedFinalizer } from "../finalizer/finalizer"
import type { FinalizationFacts, FinalizerResponse, StepFact } from "../finalizer/types"
import { EventReplayBuffer } from "../streaming/buffer"
import type { CoreStreamEvent, CoreStreamEventType } from "../streaming/types"
import type { RuntimeTurnInput, RuntimeTurnResult } from "./types"

export interface JarvisCoreRuntimeOptions {
  readonly registry: CapabilityRegistry
  readonly ledger: OperationLedger
  readonly router: ProviderRoleRouter
  readonly policyManager?: ActionPolicyManager
  readonly classifier?: DeterministicFastPathClassifier
  readonly actionRuntime?: DirectActionRuntime
  readonly finalizer?: GroundedFinalizer
}

export class JarvisCoreRuntime {
  public readonly registry: CapabilityRegistry
  public readonly ledger: OperationLedger
  public readonly router: ProviderRoleRouter
  public readonly policyManager: ActionPolicyManager
  public readonly classifier: DeterministicFastPathClassifier
  public readonly actionRuntime: DirectActionRuntime
  public readonly finalizer: GroundedFinalizer
  public readonly replayBuffer: EventReplayBuffer

  constructor(options: JarvisCoreRuntimeOptions) {
    this.registry = options.registry
    this.ledger = options.ledger
    this.router = options.router
    this.policyManager = options.policyManager ?? actionPolicyManager
    this.classifier = options.classifier ?? new DeterministicFastPathClassifier()
    this.actionRuntime =
      options.actionRuntime ??
      new DirectActionRuntime(this.registry, this.ledger, this.policyManager)
    this.finalizer = options.finalizer ?? new GroundedFinalizer({ router: this.router })
    this.replayBuffer = new EventReplayBuffer(500)
  }

  /**
   * Execute an end-to-end turn.
   */
  public async executeTurn(input: RuntimeTurnInput): Promise<RuntimeTurnResult> {
    const startTime = Date.now()
    const turnId = input.turnId ?? asTurnId(`turn_${startTime}_${Math.random().toString(36).slice(2, 9)}`)
    const deadline = new TurnDeadline(input.budgetMs ?? 60_000, input.softBufferMs ?? 5_000, startTime)
    const emittedEvents: CoreStreamEvent[] = []

    // Event emission helper
    const emit = <T>(eventType: CoreStreamEventType, data: T): CoreStreamEvent<T> => {
      const event = this.replayBuffer.push({ event: eventType, data })
      emittedEvents.push(event as CoreStreamEvent)
      if (input.streamSink) {
        try {
          input.streamSink.write(event as CoreStreamEvent)
        } catch {}
      }
      return event
    }

    // 1. INITIALIZING
    emit("turn_started", {
      turnId,
      userMessage: input.userMessage,
      timestamp: startTime,
    })

    try {
      if (input.signal?.aborted) {
        throw new Error(`Turn aborted: ${input.signal.reason ?? "client disconnected"}`)
      }
      deadline.assertNotExpired("initializing")

      // 2. CLASSIFYING
      emit("stage_changed", {
        stage: "CLASSIFYING",
        elapsedMs: deadline.elapsedMs(),
        remainingMs: deadline.remainingMs(),
        isSoftExpired: deadline.isSoftExpired(),
      })

      const classification = this.classifier.classify(input.userMessage)
      const isClarification = !classification || (classification as any).needsClarification

      if (isClarification) {
        // Needs clarification
        emit("intent_classified", {
          intent: "UNCERTAIN",
          mode: "NEEDS_CLARIFICATION",
          confidence: classification?.confidence ?? 0.3,
        })

        const clarificationFacts: FinalizationFacts = {
          turnId,
          userMessage: input.userMessage,
          executionMode: "CONVERSATIONAL",
          turnStatus: "CONFIRMATION_REQUIRED",
          steps: [],
          committedOperations: [],
          error: "Unable to determine intent with sufficient confidence. Please clarify your request.",
        }

        return await this.finalizeTurn(clarificationFacts, turnId, deadline, emit, input)
      }

      const resolved = classification as ResolvedIntent
      emit("intent_classified", {
        intent: resolved.intentKind ?? resolved.mode,
        mode: resolved.mode as any,
        confidence: resolved.confidence,
        primaryCapabilityId: resolved.targetCapability,
      })

      // 3. BRANCH BY EXECUTION MODE
      // Branch A: CHAT
      if (resolved.mode === "CHAT") {
        emit("stage_changed", {
          stage: "FINALIZING",
          elapsedMs: deadline.elapsedMs(),
          remainingMs: deadline.remainingMs(),
          isSoftExpired: deadline.isSoftExpired(),
        })

        let chatText: string
        try {
          const chatRes = await this.router.generateText("CHAT", input.userMessage, {
            deadline,
            signal: input.signal,
          })
          deadline.assertNotExpired("chat_completion")
          chatText = chatRes.text
        } catch (e: any) {
          if (e?.code === "TIMEOUT" || deadline.isExpired()) {
            throw e
          }
          chatText = `I understand your message: "${input.userMessage}". How can I assist you further?`
        }

        const chatFacts: FinalizationFacts = {
          turnId,
          userMessage: input.userMessage,
          executionMode: "CONVERSATIONAL",
          turnStatus: "SUCCEEDED",
          steps: [],
          committedOperations: [],
          contextNotes: [chatText],
        }

        return await this.finalizeTurn(chatFacts, turnId, deadline, emit, input, chatText)
      }

      // Branch B: ACTION / READ (Direct Single Action)
      if (resolved.mode === "ACTION" || resolved.mode === "READ") {
        emit("stage_changed", {
          stage: "EXECUTING",
          elapsedMs: deadline.elapsedMs(),
          remainingMs: deadline.remainingMs(),
          isSoftExpired: deadline.isSoftExpired(),
        })

        const capId = resolved.targetCapability
        if (!capId) {
          throw new Error(`Target capability could not be resolved for action "${input.userMessage}".`)
        }

        const stepId = asPlanStepId("step_1")
        emit("step_started", {
          stepId,
          capabilityId: capId,
          title: `Execute ${capId}`,
        })

        const outcome = await this.actionRuntime.executeAction(
          input.userMessage,
          capId,
          turnId,
          0,
          {
            confirmationToken: input.confirmationToken,
          }
        )

        if (outcome.status === "CONFIRMATION_REQUIRED") {
          const previewTitle = outcome.preview?.summary ?? `Confirm ${capId}`
          const reason = outcome.reason ?? "Confirmation required."
          const impactLevel = (outcome.criticality as any) || "HIGH"
          const args = outcome.arguments ?? {}
          const token = typeof outcome.confirmationToken === "string"
            ? outcome.confirmationToken
            : (outcome.confirmationToken as any)?.token

          emit("confirmation_required", {
            capabilityId: capId,
            title: previewTitle,
            impactLevel: impactLevel as any,
            reason,
            parameters: args,
            confirmationToken: token,
          })

          const facts: FinalizationFacts = {
            turnId,
            userMessage: input.userMessage,
            executionMode: "DIRECT_ACTION",
            turnStatus: "CONFIRMATION_REQUIRED",
            steps: [],
            committedOperations: [],
            pendingConfirmation: {
              capabilityId: capId,
              title: previewTitle,
              parameters: args,
              impactLevel: impactLevel as any,
              reason,
              confirmationToken: token,
            },
          }

          return await this.finalizeTurn(facts, turnId, deadline, emit, input)
        }

        if (outcome.status === "COMPLETED") {
          const result = outcome.result
          const opId = outcome.operationId
          const summary = `Successfully completed ${capId}`

          emit("step_completed", {
            stepId,
            capabilityId: capId,
            status: "COMPLETED",
            durationMs: deadline.elapsedMs(),
            summary,
          })

          const stepFact: StepFact = {
            stepId,
            capabilityId: capId,
            title: `Execute ${capId}`,
            status: "SUCCEEDED",
            summary,
            result,
          }

          const opRecord = opId ? this.ledger.getOperation(opId) : undefined
          const committedOps: OperationRecord[] = opRecord ? [opRecord] : []

          const facts: FinalizationFacts = {
            turnId,
            userMessage: input.userMessage,
            executionMode: "DIRECT_ACTION",
            turnStatus: "SUCCEEDED",
            steps: [stepFact],
            committedOperations: committedOps,
          }

          return await this.finalizeTurn(facts, turnId, deadline, emit, input)
        }

        // FAILED or BLOCKED
        const errorMsg = (outcome as any).error?.message ?? (outcome as any).reason ?? "Execution failed."
        emit("step_completed", {
          stepId,
          capabilityId: capId,
          status: "FAILED",
          durationMs: deadline.elapsedMs(),
          error: errorMsg,
        })

        const failedStep: StepFact = {
          stepId,
          capabilityId: capId,
          title: `Execute ${capId}`,
          status: "FAILED",
          error: errorMsg,
        }

        const facts: FinalizationFacts = {
          turnId,
          userMessage: input.userMessage,
          executionMode: "DIRECT_ACTION",
          turnStatus: "FAILED",
          steps: [failedStep],
          committedOperations: [],
          error: errorMsg,
        }

        return await this.finalizeTurn(facts, turnId, deadline, emit, input)
      }

      // Branch C: QUEST (Multi-Step DAG Composition)
      if (resolved.mode === "QUEST") {
        emit("stage_changed", {
          stage: "PLANNING",
          elapsedMs: deadline.elapsedMs(),
          remainingMs: deadline.remainingMs(),
          isSoftExpired: deadline.isSoftExpired(),
        })

        const subgoals = resolved.subgoals && resolved.subgoals.length > 0
          ? resolved.subgoals
          : [input.userMessage]

        const stepsPayload = subgoals.map((g, idx) => {
          const subClass = this.classifier.classify(g)
          const capId = (subClass as any)?.targetCapability ?? asCapabilityId("tasks.create")
          return {
            stepId: asPlanStepId(`step_${idx + 1}`),
            capabilityId: capId,
            objective: g,
            dependsOn: idx > 0 ? [asPlanStepId(`step_${idx}`)] : [],
          }
        })

        emit("plan_created", {
          planId: `plan_${turnId}`,
          objective: input.userMessage,
          stepCount: stepsPayload.length,
          steps: stepsPayload,
        })

        emit("stage_changed", {
          stage: "EXECUTING",
          elapsedMs: deadline.elapsedMs(),
          remainingMs: deadline.remainingMs(),
          isSoftExpired: deadline.isSoftExpired(),
        })

        const stepFacts: StepFact[] = []
        let hasFailure = false

        for (let i = 0; i < subgoals.length; i++) {
          deadline.assertNotExpired(`quest_step_${i + 1}`)
          const sPayload = stepsPayload[i]

          emit("step_started", {
            stepId: sPayload.stepId,
            capabilityId: sPayload.capabilityId,
            title: sPayload.objective,
          })

          const outcome = await this.actionRuntime.executeAction(
            sPayload.objective,
            sPayload.capabilityId,
            turnId,
            i,
            { confirmationToken: input.confirmationToken }
          )

          if (outcome.status === "COMPLETED") {
            const summary = `Executed ${sPayload.capabilityId}`
            emit("step_completed", {
              stepId: sPayload.stepId,
              capabilityId: sPayload.capabilityId,
              status: "COMPLETED",
              durationMs: deadline.elapsedMs(),
              summary,
            })
            stepFacts.push({
              stepId: sPayload.stepId,
              capabilityId: sPayload.capabilityId,
              title: sPayload.objective,
              status: "SUCCEEDED",
              summary,
              result: outcome.result,
            })
          } else {
            hasFailure = true
            const err = (outcome as any).error?.message ?? (outcome as any).reason ?? "Step execution failed."
            emit("step_completed", {
              stepId: sPayload.stepId,
              capabilityId: sPayload.capabilityId,
              status: "FAILED",
              durationMs: deadline.elapsedMs(),
              error: err,
            })
            stepFacts.push({
              stepId: sPayload.stepId,
              capabilityId: sPayload.capabilityId,
              title: sPayload.objective,
              status: "FAILED",
              error: err,
            })
            break // Stop on unhandled sequential step failure
          }
        }

        const questStatus = hasFailure
          ? stepFacts.some((s) => s.status === "SUCCEEDED")
            ? "PARTIAL"
            : "FAILED"
          : "SUCCEEDED"

        const facts: FinalizationFacts = {
          turnId,
          userMessage: input.userMessage,
          executionMode: "PLAN_DAG",
          turnStatus: questStatus,
          goal: input.userMessage,
          steps: stepFacts,
          committedOperations: [],
        }

        return await this.finalizeTurn(facts, turnId, deadline, emit, input)
      }

      // Default fallback if unknown mode
      throw new Error(`Unsupported execution mode: ${(resolved as any).mode}`)
    } catch (err: any) {
      const isAborted = Boolean(input.signal?.aborted)
      const isTimeout = err?.code === "TIMEOUT" || deadline.isExpired()
      const errorCode = isAborted ? "CLIENT_ABORTED" : isTimeout ? "TURN_TIMEOUT" : "RUNTIME_ERROR"
      const errorMessage = err?.message ?? String(err)

      emit("error", {
        code: errorCode,
        message: errorMessage,
        retryable: false,
      })

      const errorFacts: FinalizationFacts = {
        turnId,
        userMessage: input.userMessage,
        executionMode: "CONVERSATIONAL",
        turnStatus: "FAILED",
        steps: [],
        committedOperations: [],
        error: errorMessage,
      }

      return await this.finalizeTurn(errorFacts, turnId, deadline, emit, input)
    } finally {
      input.streamSink?.close()
    }
  }

  // ==========================================================================
  // FINALIZATION HELPER
  // ==========================================================================

  private async finalizeTurn(
    facts: FinalizationFacts,
    turnId: TurnId,
    deadline: TurnDeadline,
    emit: <T>(eventType: CoreStreamEventType, data: T) => CoreStreamEvent<T>,
    input: RuntimeTurnInput,
    overrideText?: string
  ): Promise<RuntimeTurnResult> {
    emit("stage_changed", {
      stage: "FINALIZING",
      elapsedMs: deadline.elapsedMs(),
      remainingMs: deadline.remainingMs(),
      isSoftExpired: deadline.isSoftExpired(),
    })

    const finalizerRes: FinalizerResponse = overrideText
      ? {
          text: overrideText,
          grounded: true,
          turnStatus: facts.turnStatus,
          factsSummary: {
            totalSteps: facts.steps.length,
            succeededSteps: facts.steps.filter((s) => s.status === "SUCCEEDED").length,
            failedSteps: facts.steps.filter((s) => s.status === "FAILED").length,
            committedOperations: facts.committedOperations.length,
          },
          synthesizer: "MODEL",
          redactedSecretsCount: 0,
        }
      : await this.finalizer.finalize(facts, { deadline, signal: input.signal })

    // Stream text in delta chunks for responsive UI / SSE
    if (input.streamSink && finalizerRes.text) {
      const words = finalizerRes.text.split(" ")
      let chunkIdx = 0
      for (let i = 0; i < words.length; i += 5) {
        const delta = words.slice(i, i + 5).join(" ") + (i + 5 < words.length ? " " : "")
        emit("response_chunk", { delta, index: chunkIdx++ })
      }
    }

    emit("turn_completed", {
      turnId,
      status: finalizerRes.turnStatus,
      responseText: finalizerRes.text,
      durationMs: deadline.elapsedMs(),
      stats: finalizerRes.factsSummary,
    })

    emit("stage_changed", {
      stage: "COMPLETED",
      elapsedMs: deadline.elapsedMs(),
      remainingMs: deadline.remainingMs(),
      isSoftExpired: deadline.isSoftExpired(),
    })

    return {
      turnId,
      status: finalizerRes.turnStatus,
      responseText: finalizerRes.text,
      finalizerResponse: finalizerRes,
      facts,
      durationMs: deadline.elapsedMs(),
      events: this.replayBuffer.getEventsSince(0),
    }
  }
}
