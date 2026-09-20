/**
 * JARVIS CORE V2 — PERSISTED QUEST ENGINE TYPES
 * 
 * Checkpoint C8: Canonical types for multi-step goals, persisted quests,
 * subgoals, step dependencies, and operation ledger linkage.
 */

import type {
  CapabilityId,
  JsonValue,
  QuestId,
  PlanStepId,
  QuestStatus as CoreQuestStatus,
  StepStatus as CoreStepStatus,
} from "../types"
import { asQuestId, asPlanStepId } from "../types"
import type { OperationId } from "../ledger/types"

export type QuestStatus = CoreQuestStatus
export type QuestStepStatus = CoreStepStatus

export type { QuestId }
export { asQuestId }

export type StepId = PlanStepId
export const asStepId = asPlanStepId

export interface QuestRecord {
  readonly questId: QuestId
  readonly sessionId: string
  readonly title: string
  readonly prompt: string
  readonly status: QuestStatus
  readonly metadata: JsonValue | null
  readonly resultSummary: string | null
  readonly errorMessage: string | null
  readonly createdAt: number
  readonly updatedAt: number
  readonly completedAt: number | null
}

export interface QuestStepRecord {
  readonly stepId: StepId
  readonly questId: QuestId
  readonly stepIndex: number
  readonly title: string
  readonly capabilityId: CapabilityId
  readonly status: QuestStepStatus
  readonly operationId: OperationId | null
  readonly inputPayload: JsonValue | null
  readonly resultPayload: JsonValue | null
  readonly errorCode: string | null
  readonly errorMessage: string | null
  readonly dependencies: ReadonlyArray<StepId>
  readonly retryCount: number
  readonly maxRetries: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly completedAt: number | null
}

export interface QuestWithSteps extends QuestRecord {
  readonly steps: ReadonlyArray<QuestStepRecord>
}

export interface CreateQuestParams {
  readonly questId?: QuestId
  readonly sessionId: string
  readonly title: string
  readonly prompt: string
  readonly metadata?: JsonValue
  readonly steps?: ReadonlyArray<CreateStepParams>
}

export interface CreateStepParams {
  readonly stepId?: StepId
  readonly title: string
  readonly capabilityId: CapabilityId
  readonly inputPayload?: JsonValue
  readonly dependencies?: ReadonlyArray<StepId>
  readonly maxRetries?: number
}

export interface ListQuestsFilter {
  readonly sessionId?: string
  readonly status?: QuestStatus
  readonly limit?: number
  readonly offset?: number
}

export interface QuestRecoverySummary {
  readonly recoveredQuests: number
  readonly suspendedQuests: number
  readonly recoveredSteps: number
  readonly failedSteps: number
  readonly unknownCommitSteps?: number
}
