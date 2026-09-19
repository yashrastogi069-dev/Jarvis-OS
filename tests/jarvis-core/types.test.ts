// tests/jarvis-core/types.test.ts
// Verification of Checkpoint C1 Domain Types and Runtime Contracts

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  asTraceId,
  asTurnId,
  asQuestId,
  asPlanId,
  asPlanStepId,
  asCapabilityId,
  asToolCallId,
  asOperationId,
  type TraceId,
  type TurnId,
  type QuestId,
  type PlanId,
  type PlanStepId,
  type CapabilityId,
  type ExecutionMode,
  type TurnStatus,
  type QuestStatus,
  type StepStatus,
  type ActionClass,
  type ConfirmationState,
  type OperationStatus,
  type IdempotencyClass,
  type CapabilityAvailability,
  type ProviderRole,
  type RuntimeErrorKind,
  type TraceContext,
  type Turn,
  type Quest,
  type Plan,
  type PlanStep,
  type TurnResult,
  type TurnEvent,
  type TurnController,
} from "@/lib/jarvis-core/types"

describe("Checkpoint C1: Domain Types & Runtime Contracts", () => {
  it("1. Strong identities construct and remain JSON-safe strings", () => {
    const traceId: TraceId = asTraceId("trace-123")
    const turnId: TurnId = asTurnId("turn-456")
    const questId: QuestId = asQuestId("quest-789")
    const planId: PlanId = asPlanId("plan-012")
    const stepId: PlanStepId = asPlanStepId("step-345")
    const capId: CapabilityId = asCapabilityId("saveMemory")
    const toolCallId = asToolCallId("call-678")
    const opId = asOperationId("op-901")

    expect(typeof traceId).toBe("string")
    expect(traceId).toBe("trace-123")
    expect(turnId).toBe("turn-456")
    expect(questId).toBe("quest-789")
    expect(planId).toBe("plan-012")
    expect(stepId).toBe("step-345")
    expect(capId).toBe("saveMemory")
    expect(toolCallId).toBe("call-678")
    expect(opId).toBe("op-901")

    // Verify string serialization in JSON
    const serialized = JSON.stringify({ traceId, turnId, questId, planId, stepId, capId, toolCallId, opId })
    const deserialized = JSON.parse(serialized)
    expect(deserialized.traceId).toBe("trace-123")
    expect(deserialized.stepId).toBe("step-345")
  })

  it("2. Validates all Execution Modes are distinct", () => {
    const modes: ExecutionMode[] = ["CHAT", "READ", "ACTION", "QUEST", "AMBIGUOUS"]
    const uniqueModes = new Set(modes)
    expect(uniqueModes.size).toBe(5)
  })

  it("3. Validates Turn lifecycle states are distinct and complete", () => {
    const turnStatuses: TurnStatus[] = [
      "RECEIVED",
      "CLASSIFYING",
      "NEEDS_CLARIFICATION",
      "ROUTING",
      "PLANNING",
      "EXECUTING",
      "FINALIZING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
    ]
    const uniqueStatuses = new Set(turnStatuses)
    expect(uniqueStatuses.size).toBe(10)
  })

  it("4. Validates Quest lifecycle states", () => {
    const questStatuses: QuestStatus[] = [
      "CREATED",
      "NEEDS_CLARIFICATION",
      "WAITING_FOR_CONFIRMATION",
      "READY",
      "RUNNING",
      "PARTIALLY_COMPLETED",
      "COMPLETED",
      "BLOCKED",
      "FAILED",
      "CANCELLED",
    ]
    const uniqueStatuses = new Set(questStatuses)
    expect(uniqueStatuses.size).toBe(10)
  })

  it("5. Validates Step states distinguish critical operational failure modes", () => {
    const stepStatuses: StepStatus[] = [
      "PENDING",
      "READY",
      "WAITING_FOR_CONFIRMATION",
      "RUNNING",
      "COMPLETED",
      "BLOCKED_WITH_REASON",
      "FAILED_RETRYABLE",
      "FAILED_FINAL",
      "UNKNOWN_COMMIT",
      "CANCELLED",
    ]
    const uniqueStatuses = new Set(stepStatuses)
    expect(uniqueStatuses.size).toBe(10)

    // Explicitly verify critical distinctions
    expect(stepStatuses).toContain("FAILED_RETRYABLE")
    expect(stepStatuses).toContain("FAILED_FINAL")
    expect(stepStatuses).toContain("UNKNOWN_COMMIT")
    expect(stepStatuses).toContain("BLOCKED_WITH_REASON")
  })

  it("6. Validates Action classifications", () => {
    const actionClasses: ActionClass[] = [
      "READ_ONLY",
      "LOCAL_CREATE",
      "LOCAL_UPDATE",
      "LOCAL_DELETE",
      "EXTERNAL_CREATE",
      "EXTERNAL_UPDATE",
      "EXTERNAL_SEND",
      "EXTERNAL_DELETE",
      "SYSTEM_ACTION",
    ]
    expect(new Set(actionClasses).size).toBe(9)
  })

  it("7. Validates Confirmation state vocabulary", () => {
    const states: ConfirmationState[] = [
      "NOT_REQUIRED",
      "REQUIRED",
      "WAITING",
      "CONFIRMED",
      "REJECTED",
      "EXPIRED",
    ]
    expect(new Set(states).size).toBe(6)
  })

  it("8. Validates Operation and Idempotency vocabulary", () => {
    const opStatuses: OperationStatus[] = ["PENDING", "SUCCEEDED", "FAILED", "UNKNOWN_COMMIT"]
    expect(new Set(opStatuses).size).toBe(4)

    const idemClasses: IdempotencyClass[] = [
      "READ_ONLY",
      "NATURALLY_IDEMPOTENT",
      "LEDGER_REQUIRED",
      "REMOTE_IDEMPOTENCY_SUPPORTED",
      "NON_IDEMPOTENT_EXTERNAL",
      "UNKNOWN",
    ]
    expect(new Set(idemClasses).size).toBe(6)
  })

  it("9. Validates Capability Availability and Provider Roles", () => {
    const availabilities: CapabilityAvailability[] = [
      "AVAILABLE",
      "REQUIRES_AUTH",
      "UNCONFIGURED",
      "DEGRADED",
      "DISABLED",
      "UNAVAILABLE",
    ]
    expect(new Set(availabilities).size).toBe(6)

    const roles: ProviderRole[] = ["CHAT", "PLANNER", "REPLANNER", "FINALIZER"]
    expect(new Set(roles).size).toBe(4)
    // Verify Executor is NOT included as a provider role
    expect(roles).not.toContain("EXECUTOR")
  })

  it("10. Validates Runtime Error Kinds", () => {
    const errorKinds: RuntimeErrorKind[] = [
      "VALIDATION",
      "POLICY",
      "CAPABILITY",
      "PROVIDER",
      "TIMEOUT",
      "CANCELLED",
      "INTERNAL",
    ]
    expect(new Set(errorKinds).size).toBe(7)
  })

  it("11. Serializes representative Turn, Quest, Plan, and TraceContext objects cleanly", () => {
    const traceContext: TraceContext = {
      traceId: asTraceId("trace-001"),
      turnId: asTurnId("turn-001"),
      questId: asQuestId("quest-001"),
      planId: asPlanId("plan-001"),
      stepId: asPlanStepId("step-001"),
    }

    const turn: Turn = {
      id: asTurnId("turn-001"),
      traceId: asTraceId("trace-001"),
      input: {
        text: "Check my unread emails and remind me to reply to Alex tomorrow",
        sessionHistory: [
          { role: "user", text: "Hello" },
          { role: "assistant", text: "Hello! How can I assist you today?" },
        ],
        clientMetadata: { client: "web", timezone: "America/Los_Angeles" },
      },
      executionMode: "QUEST",
      status: "EXECUTING",
      createdAt: 1710000000000,
    }

    const quest: Quest = {
      id: asQuestId("quest-001"),
      turnId: asTurnId("turn-001"),
      traceId: asTraceId("trace-001"),
      objective: "Summarize unread emails and create a follow-up reminder for Alex",
      status: "RUNNING",
      planId: asPlanId("plan-001"),
      createdAt: 1710000000100,
      updatedAt: 1710000000200,
    }

    const step1: PlanStep = {
      id: asPlanStepId("step-001"),
      objective: "Fetch unread emails",
      capabilityId: asCapabilityId("getRecentEmails"),
      arguments: { maxResults: 5 },
      dependsOn: [],
      status: "COMPLETED",
      completedAt: 1710000000500,
    }

    const step2: PlanStep = {
      id: asPlanStepId("step-002"),
      objective: "Create reminder task for Alex",
      capabilityId: asCapabilityId("createTask"),
      arguments: { title: "Reply to Alex", dueAt: "2026-09-20T09:00:00Z" },
      dependsOn: [asPlanStepId("step-001")],
      status: "PENDING",
    }

    const plan: Plan = {
      id: asPlanId("plan-001"),
      questId: asQuestId("quest-001"),
      traceId: asTraceId("trace-001"),
      objective: "Email summarization and reminder creation",
      version: 1,
      steps: [step1, step2],
      createdAt: 1710000000250,
    }

    const payload = { traceContext, turn, quest, plan }
    const jsonStr = JSON.stringify(payload)
    expect(jsonStr).toBeDefined()
    expect(jsonStr.length).toBeGreaterThan(100)

    const parsed = JSON.parse(jsonStr)
    expect(parsed.traceContext.traceId).toBe("trace-001")
    expect(parsed.turn.executionMode).toBe("QUEST")
    expect(parsed.quest.status).toBe("RUNNING")
    expect(parsed.plan.steps.length).toBe(2)
    expect(parsed.plan.steps[0].status).toBe("COMPLETED")
    expect(parsed.plan.steps[1].dependsOn[0]).toBe("step-001")
  })

  it("12. Static analysis: lib/jarvis-core/types.ts has ZERO framework imports", () => {
    const typesFilePath = path.join(process.cwd(), "lib", "jarvis-core", "types.ts")
    expect(fs.existsSync(typesFilePath)).toBe(true)

    const fileContent = fs.readFileSync(typesFilePath, "utf8")

    // Must NOT import React, Next.js, or AI SDK
    expect(fileContent).not.toMatch(/from\s+['"]react['"]/)
    expect(fileContent).not.toMatch(/from\s+['"]next\/?.*['"]/)
    expect(fileContent).not.toMatch(/from\s+['"]ai['"]/)
    expect(fileContent).not.toMatch(/from\s+['"]@ai-sdk\/.*['"]/)
    expect(fileContent).not.toMatch(/import\s+.*ToolLoopAgent/)
    expect(fileContent).not.toMatch(/import\s+.*NextRequest/)
    expect(fileContent).not.toMatch(/import\s+.*NextResponse/)
  })

  it("13. Validates TurnController and event interface can be mock-implemented headlessly", async () => {
    const events: TurnEvent[] = []

    const mockController: TurnController = {
      async processTurn(input, onEvent) {
        const turnId = asTurnId("turn-mock-1")
        onEvent?.({ type: "turn_started", turnId, mode: "CHAT" })
        onEvent?.({ type: "content_delta", text: `Echo: ${input.text}` })
        onEvent?.({ type: "turn_finished", turnId, finalResponse: `Echo: ${input.text}` })

        const turn: Turn = {
          id: turnId,
          traceId: asTraceId("trace-mock-1"),
          input,
          executionMode: "CHAT",
          status: "COMPLETED",
          createdAt: Date.now(),
          completedAt: Date.now(),
        }

        return {
          turn,
          finalResponse: `Echo: ${input.text}`,
        }
      },
    }

    const result = await mockController.processTurn(
      { text: "Hello Jarvis" },
      (ev) => events.push(ev),
    )

    expect(result.turn.status).toBe("COMPLETED")
    expect(result.finalResponse).toBe("Echo: Hello Jarvis")
    expect(events.length).toBe(3)
    expect(events[0].type).toBe("turn_started")
    expect(events[2].type).toBe("turn_finished")
  })
})
