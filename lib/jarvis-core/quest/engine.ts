/**
 * JARVIS CORE V2 — PERSISTED QUEST ENGINE
 * 
 * Checkpoint C8: Persisted quest schema, lifecycle state machine in SQLite,
 * multi-step execution tracking, dependency DAG enforcement, crash recovery,
 * and operation ledger linkage.
 */

import crypto from "node:crypto"
import type Database from "better-sqlite3"
import { getRawDb } from "../../db"
import type { CapabilityId, JsonValue } from "../types"
import { asOperationId } from "../types"
import { toJsonValue } from "../capabilities/json"
import { sanitizeSecrets } from "../capabilities/normalizer"
import type { OperationId, OperationLedger } from "../ledger"
import { initQuestSchema } from "./schema"
import {
  type QuestRecord,
  type QuestStepRecord,
  type QuestWithSteps,
  type QuestStatus,
  type QuestStepStatus,
  type CreateQuestParams,
  type CreateStepParams,
  type ListQuestsFilter,
  type QuestRecoverySummary,
  asQuestId,
  asStepId,
  type QuestId,
  type StepId,
} from "./types"

interface RawQuestRow {
  quest_id: string
  session_id: string
  title: string
  prompt: string
  status: string
  metadata: string | null
  result_summary: string | null
  error_message: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
}

interface RawQuestStepRow {
  step_id: string
  quest_id: string
  step_index: number
  title: string
  capability_id: string
  status: string
  operation_id: string | null
  input_payload: string | null
  result_payload: string | null
  error_code: string | null
  error_message: string | null
  dependencies: string | null
  retry_count: number
  max_retries: number
  created_at: number
  updated_at: number
  completed_at: number | null
}

function serializeAndSanitize(value: unknown): string | null {
  if (value === undefined || value === null) return null
  try {
    const safe = toJsonValue(value)
    return sanitizeSecrets(JSON.stringify(safe))
  } catch {
    return null
  }
}

function parseSanitized(jsonStr: string | null): JsonValue | null {
  if (!jsonStr) return null
  try {
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

export class QuestEngine {
  private readonly db: Database.Database

  constructor(injectedDb?: Database.Database) {
    this.db = injectedDb ?? (getRawDb() as unknown as Database.Database)
    initQuestSchema(this.db)
  }

  /**
   * Create a new persistent quest and optionally its planned steps in a single atomic transaction.
   */
  public createQuest(params: CreateQuestParams): QuestWithSteps {
    const now = Date.now()
    const questId =
      params.questId ??
      asQuestId(`quest_${now}_${crypto.randomBytes(4).toString("hex")}`)

    const sanitizedMetadata = serializeAndSanitize(params.metadata)

    const createTx = this.db.transaction(() => {
      const insertQuestStmt = this.db.prepare(`
        INSERT INTO quests (
          quest_id, session_id, title, prompt, status, metadata,
          result_summary, error_message, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, 'RUNNING', ?, NULL, NULL, ?, ?, NULL)
      `)

      insertQuestStmt.run(
        questId,
        params.sessionId,
        params.title,
        params.prompt,
        sanitizedMetadata,
        now,
        now
      )

      const createdSteps: QuestStepRecord[] = []

      if (params.steps && params.steps.length > 0) {
        const insertStepStmt = this.db.prepare(`
          INSERT INTO quest_steps (
            step_id, quest_id, step_index, title, capability_id,
            status, operation_id, input_payload, result_payload,
            error_code, error_message, dependencies, retry_count,
            max_retries, created_at, updated_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, 'PENDING', NULL, ?, NULL, NULL, NULL, ?, 0, ?, ?, ?, NULL)
        `)

        params.steps.forEach((step, idx) => {
          const stepId =
            step.stepId ??
            asStepId(`step_${now}_${idx}_${crypto.randomBytes(3).toString("hex")}`)
          const sanitizedInput = serializeAndSanitize(step.inputPayload)
          const depsJson = step.dependencies
            ? JSON.stringify(step.dependencies)
            : JSON.stringify([])
          const maxRetries = step.maxRetries ?? 2

          insertStepStmt.run(
            stepId,
            questId,
            idx,
            step.title,
            step.capabilityId,
            sanitizedInput,
            depsJson,
            maxRetries,
            now,
            now
          )

          createdSteps.push({
            stepId,
            questId,
            stepIndex: idx,
            title: step.title,
            capabilityId: step.capabilityId,
            status: "PENDING",
            operationId: null,
            inputPayload: parseSanitized(sanitizedInput),
            resultPayload: null,
            errorCode: null,
            errorMessage: null,
            dependencies: step.dependencies ?? [],
            retryCount: 0,
            maxRetries,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
          })
        })
      }

      const questRecord: QuestRecord = {
        questId,
        sessionId: params.sessionId,
        title: params.title,
        prompt: params.prompt,
        status: "RUNNING",
        metadata: parseSanitized(sanitizedMetadata),
        resultSummary: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      }

      return {
        ...questRecord,
        steps: createdSteps,
      }
    })

    return createTx()
  }

  /**
   * Add a new step to an existing quest.
   */
  public addStep(questId: QuestId, step: CreateStepParams): QuestStepRecord {
    const now = Date.now()

    const addTx = this.db.transaction(() => {
      const quest = this.getQuestRow(questId)
      if (!quest) {
        throw new Error(`Quest "${questId}" does not exist.`)
      }
      if (quest.status === "SUCCEEDED" || quest.status === "FAILED" || quest.status === "CANCELLED") {
        throw new Error(`Cannot add step to terminated quest "${questId}" (status: ${quest.status}).`)
      }

      const countStmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM quest_steps WHERE quest_id = ?"
      )
      const { count } = countStmt.get(questId) as { count: number }
      const stepIndex = count

      const stepId =
        step.stepId ??
        asStepId(`step_${now}_${stepIndex}_${crypto.randomBytes(3).toString("hex")}`)
      const sanitizedInput = serializeAndSanitize(step.inputPayload)
      const depsJson = step.dependencies
        ? JSON.stringify(step.dependencies)
        : JSON.stringify([])
      const maxRetries = step.maxRetries ?? 2

      const insertStmt = this.db.prepare(`
        INSERT INTO quest_steps (
          step_id, quest_id, step_index, title, capability_id,
          status, operation_id, input_payload, result_payload,
          error_code, error_message, dependencies, retry_count,
          max_retries, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', NULL, ?, NULL, NULL, NULL, ?, 0, ?, ?, ?, NULL)
      `)

      insertStmt.run(
        stepId,
        questId,
        stepIndex,
        step.title,
        step.capabilityId,
        sanitizedInput,
        depsJson,
        maxRetries,
        now,
        now
      )

      return {
        stepId,
        questId,
        stepIndex,
        title: step.title,
        capabilityId: step.capabilityId,
        status: "PENDING" as QuestStepStatus,
        operationId: null,
        inputPayload: parseSanitized(sanitizedInput),
        resultPayload: null,
        errorCode: null,
        errorMessage: null,
        dependencies: step.dependencies ?? [],
        retryCount: 0,
        maxRetries,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      }
    })

    return addTx()
  }

  /**
   * Get a quest and all its steps by questId.
   */
  public getQuest(questId: QuestId): QuestWithSteps | null {
    const rawQuest = this.getQuestRow(questId)
    if (!rawQuest) return null

    const stepStmt = this.db.prepare(`
      SELECT * FROM quest_steps WHERE quest_id = ? ORDER BY step_index ASC
    `)
    const rawSteps = stepStmt.all(questId) as RawQuestStepRow[]

    const questRecord = this.mapRawQuest(rawQuest)
    const steps = rawSteps.map((s) => this.mapRawStep(s))

    return {
      ...questRecord,
      steps,
    }
  }

  /**
   * List quests with optional filtering.
   */
  public listQuests(filter?: ListQuestsFilter): ReadonlyArray<QuestRecord> {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filter?.sessionId) {
      conditions.push("session_id = ?")
      params.push(filter.sessionId)
    }
    if (filter?.status) {
      conditions.push("status = ?")
      params.push(filter.status)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const limit = filter?.limit ?? 50
    const offset = filter?.offset ?? 0

    const query = `
      SELECT * FROM quests
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `
    params.push(limit, offset)

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as RawQuestRow[]
    return rows.map((r) => this.mapRawQuest(r))
  }

  /**
   * Transition a step to RUNNING after validating all dependencies are SUCCEEDED.
   * Atomically links the operationId.
   */
  public startStep(stepId: StepId, operationId?: OperationId): QuestStepRecord {
    const now = Date.now()

    const startTx = this.db.transaction(() => {
      const step = this.getStepRow(stepId)
      if (!step) {
        throw new Error(`QuestStep "${stepId}" does not exist.`)
      }
      if (step.status !== "PENDING") {
        throw new Error(
          `Cannot start step "${stepId}" in status "${step.status}" (must be PENDING).`
        )
      }

      const quest = this.getQuestRow(asQuestId(step.quest_id))
      if (!quest || quest.status !== "RUNNING") {
        throw new Error(
          `Cannot start step in quest "${step.quest_id}" with status "${quest?.status}".`
        )
      }

      // Verify dependencies
      const dependencies: StepId[] = step.dependencies ? JSON.parse(step.dependencies) : []
      if (dependencies.length > 0) {
        const placeholders = dependencies.map(() => "?").join(",")
        const depStmt = this.db.prepare(`
          SELECT step_id, status FROM quest_steps WHERE step_id IN (${placeholders})
        `)
        const depRows = depStmt.all(...dependencies) as Array<{ step_id: string; status: string }>
        const completedDeps = new Set(
          depRows.filter((d) => d.status === "SUCCEEDED").map((d) => d.step_id)
        )

        for (const depId of dependencies) {
          if (!completedDeps.has(depId)) {
            throw new Error(
              `Cannot start step "${stepId}": prerequisite dependency "${depId}" is not SUCCEEDED.`
            )
          }
        }
      }

      const updateStmt = this.db.prepare(`
        UPDATE quest_steps
        SET status = 'RUNNING',
            operation_id = ?,
            updated_at = ?
        WHERE step_id = ?
      `)
      updateStmt.run(operationId ?? null, now, stepId)

      const updatedRaw = this.getStepRow(stepId)!
      return this.mapRawStep(updatedRaw)
    })

    return startTx()
  }

  /**
   * Mark a step as SUCCEEDED with its result payload.
   * If all steps in the quest are now terminal, transitions the quest to AWAITING_VERIFICATION.
   * C12 Completion Verifier owns final goal verification and terminal completion.
   */
  public completeStep(stepId: StepId, resultPayload?: JsonValue): QuestStepRecord {
    const now = Date.now()

    const completeTx = this.db.transaction(() => {
      const step = this.getStepRow(stepId)
      if (!step) {
        throw new Error(`QuestStep "${stepId}" does not exist.`)
      }

      const sanitizedResult = serializeAndSanitize(resultPayload)

      const updateStepStmt = this.db.prepare(`
        UPDATE quest_steps
        SET status = 'SUCCEEDED',
            result_payload = ?,
            updated_at = ?,
            completed_at = ?
        WHERE step_id = ?
      `)
      updateStepStmt.run(sanitizedResult, now, now, stepId)

      // Check if all steps of this quest are complete
      const checkStmt = this.db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status IN ('SUCCEEDED', 'COMPLETED', 'SKIPPED') THEN 1 ELSE 0 END) as terminal
        FROM quest_steps
        WHERE quest_id = ?
      `)
      const stats = checkStmt.get(step.quest_id) as { total: number; terminal: number }

      if (stats.total > 0 && stats.total === stats.terminal) {
        // Blocker F: Transition to AWAITING_VERIFICATION. C12 Completion Verifier owns final resolution.
        const updateQuestStmt = this.db.prepare(`
          UPDATE quests
          SET status = 'AWAITING_VERIFICATION',
              updated_at = ?
          WHERE quest_id = ? AND status = 'RUNNING'
        `)
        updateQuestStmt.run(now, step.quest_id)
      }

      const updatedRaw = this.getStepRow(stepId)!
      return this.mapRawStep(updatedRaw)
    })

    return completeTx()
  }

  /**
   * C12 Completion Verifier Gateway (Blocker F):
   * Explicitly resolves an AWAITING_VERIFICATION (or RUNNING) quest to a terminal state
   * (COMPLETED, SUCCEEDED, FAILED, or PARTIALLY_COMPLETED) with a verified result summary.
   */
  public verifyAndCompleteQuest(
    questId: QuestId,
    terminalStatus: "COMPLETED" | "SUCCEEDED" | "FAILED" | "PARTIALLY_COMPLETED" = "SUCCEEDED",
    resultSummary?: string
  ): QuestRecord {
    const now = Date.now()

    const completeTx = this.db.transaction(() => {
      const quest = this.getQuestRow(questId)
      if (!quest) {
        throw new Error(`Quest "${questId}" does not exist.`)
      }
      if (quest.status !== "AWAITING_VERIFICATION" && quest.status !== "RUNNING") {
        throw new Error(
          `Cannot verify and complete quest "${questId}" in status "${quest.status}" (must be AWAITING_VERIFICATION or RUNNING).`
        )
      }

      const updateStmt = this.db.prepare(`
        UPDATE quests
        SET status = ?,
            result_summary = ?,
            updated_at = ?,
            completed_at = ?
        WHERE quest_id = ?
      `)
      updateStmt.run(terminalStatus, resultSummary ?? null, now, now, questId)

      const updatedRaw = this.getQuestRow(questId)!
      return this.mapRawQuest(updatedRaw)
    })

    return completeTx()
  }

  /**
   * Handle step failure. If retryable and retry budget remains, resets status to PENDING.
   * If max retries exhausted, marks step as FAILED and fails the entire quest.
   */
  public failStep(
    stepId: StepId,
    errorCode: string,
    errorMessage: string,
    retryable = true
  ): QuestStepRecord {
    const now = Date.now()

    const failTx = this.db.transaction(() => {
      const step = this.getStepRow(stepId)
      if (!step) {
        throw new Error(`QuestStep "${stepId}" does not exist.`)
      }

      const canRetry = retryable && step.retry_count < step.max_retries

      if (canRetry) {
        const updateRetryStmt = this.db.prepare(`
          UPDATE quest_steps
          SET status = 'PENDING',
              retry_count = retry_count + 1,
              error_code = ?,
              error_message = ?,
              updated_at = ?
          WHERE step_id = ?
        `)
        updateRetryStmt.run(errorCode, errorMessage, now, stepId)
      } else {
        const updateFailStmt = this.db.prepare(`
          UPDATE quest_steps
          SET status = 'FAILED',
              error_code = ?,
              error_message = ?,
              updated_at = ?,
              completed_at = ?
          WHERE step_id = ?
        `)
        updateFailStmt.run(errorCode, errorMessage, now, now, stepId)

        // Quest fails if a step exhausts retries and fails
        const updateQuestStmt = this.db.prepare(`
          UPDATE quests
          SET status = 'FAILED',
              error_message = ?,
              updated_at = ?,
              completed_at = ?
          WHERE quest_id = ?
        `)
        updateQuestStmt.run(
          `Step "${step.title}" failed: [${errorCode}] ${errorMessage}`,
          now,
          now,
          step.quest_id
        )
      }

      const updatedRaw = this.getStepRow(stepId)!
      return this.mapRawStep(updatedRaw)
    })

    return failTx()
  }

  /**
   * Skip a step (e.g. conditional branch or quest cancellation).
   */
  public skipStep(stepId: StepId, reason?: string): QuestStepRecord {
    const now = Date.now()
    const updateStmt = this.db.prepare(`
      UPDATE quest_steps
      SET status = 'SKIPPED',
          result_payload = ?,
          updated_at = ?,
          completed_at = ?
      WHERE step_id = ?
    `)
    updateStmt.run(reason ? JSON.stringify({ skippedReason: reason }) : null, now, now, stepId)

    const updatedRaw = this.getStepRow(stepId)!
    return this.mapRawStep(updatedRaw)
  }

  /**
   * Cancel an active or suspended quest.
   * All pending or running steps are marked as SKIPPED.
   */
  public cancelQuest(questId: QuestId, reason?: string): QuestRecord {
    const now = Date.now()

    const cancelTx = this.db.transaction(() => {
      const quest = this.getQuestRow(questId)
      if (!quest) {
        throw new Error(`Quest "${questId}" does not exist.`)
      }

      const updateQuestStmt = this.db.prepare(`
        UPDATE quests
        SET status = 'CANCELLED',
            result_summary = ?,
            updated_at = ?,
            completed_at = ?
        WHERE quest_id = ?
      `)
      updateQuestStmt.run(reason ?? "Cancelled by user or policy.", now, now, questId)

      const skipStepsStmt = this.db.prepare(`
        UPDATE quest_steps
        SET status = 'SKIPPED',
            result_payload = ?,
            updated_at = ?,
            completed_at = ?
        WHERE quest_id = ? AND status IN ('PENDING', 'RUNNING')
      `)
      skipStepsStmt.run(JSON.stringify({ skippedReason: "Quest cancelled" }), now, now, questId)

      const updatedRaw = this.getQuestRow(questId)!
      return this.mapRawQuest(updatedRaw)
    })

    return cancelTx()
  }

  /**
   * Suspend a quest (e.g. waiting for human confirmation or interaction).
   */
  public suspendQuest(questId: QuestId, reason?: string): QuestRecord {
    const now = Date.now()
    const updateStmt = this.db.prepare(`
      UPDATE quests
      SET status = 'SUSPENDED',
          result_summary = ?,
          updated_at = ?
      WHERE quest_id = ?
    `)
    updateStmt.run(reason ?? "Suspended awaiting interaction.", now, questId)

    const updatedRaw = this.getQuestRow(questId)!
    return this.mapRawQuest(updatedRaw)
  }

  /**
   * Resume a suspended quest back to RUNNING.
   */
  public resumeQuest(questId: QuestId): QuestRecord {
    const now = Date.now()
    const updateStmt = this.db.prepare(`
      UPDATE quests
      SET status = 'RUNNING',
          updated_at = ?
      WHERE quest_id = ? AND status = 'SUSPENDED'
    `)
    const res = updateStmt.run(now, questId)
    if (res.changes === 0) {
      throw new Error(`Quest "${questId}" is not in SUSPENDED status.`)
    }

    const updatedRaw = this.getQuestRow(questId)!
    return this.mapRawQuest(updatedRaw)
  }

  /**
   * Boot recovery routine: Transitions orphaned RUNNING quests to SUSPENDED.
   * For orphaned RUNNING steps, reconciles with the OperationLedger (Blocker E):
   * - If step has an operationId and ledger is provided:
   *   - Ledger UNKNOWN_COMMIT -> step transitions to UNKNOWN_COMMIT (automated replay permanently blocked)
   *   - Ledger SUCCEEDED -> step transitions to SUCCEEDED with restored payload
   *   - Ledger FAILED_FINAL -> step transitions to FAILED
   *   - Ledger FAILED_RETRYABLE -> step resets to PENDING if retry budget remains, else FAILED
   *   - Ledger RUNNING -> UNKNOWN_COMMIT for mutations, PENDING for READ_ONLY
   *   - Not in ledger -> UNKNOWN_COMMIT
   * - If step has no operationId or ledger is omitted: resets to PENDING for safe restart
   */
  public recoverCrashedQuests(ledger?: OperationLedger): QuestRecoverySummary {
    const now = Date.now()

    const recoveryTx = this.db.transaction(() => {
      // Find running quests
      const findQuestsStmt = this.db.prepare(`
        SELECT quest_id FROM quests WHERE status IN ('RUNNING', 'INITIALIZING')
      `)
      const runningQuests = findQuestsStmt.all() as Array<{ quest_id: string }>

      const updateQuestsStmt = this.db.prepare(`
        UPDATE quests
        SET status = 'SUSPENDED',
            error_message = 'Process restarted while quest was running. Resumption required.',
            updated_at = ?
        WHERE status IN ('RUNNING', 'INITIALIZING')
      `)
      const questRes = updateQuestsStmt.run(now)

      // Find running steps
      const findStepsStmt = this.db.prepare(`
        SELECT * FROM quest_steps WHERE status = 'RUNNING'
      `)
      const runningSteps = findStepsStmt.all() as RawQuestStepRow[]

      let recoveredSteps = 0
      let failedSteps = 0
      let unknownCommitSteps = 0

      for (const step of runningSteps) {
        if (ledger && step.operation_id) {
          const op = ledger.getOperation(asOperationId(step.operation_id))
          if (!op) {
            this.db.prepare(`
              UPDATE quest_steps
              SET status = 'UNKNOWN_COMMIT',
                  error_code = 'UNKNOWN_COMMIT',
                  error_message = 'Associated operation not found in ledger upon crash recovery.',
                  updated_at = ?
              WHERE step_id = ?
            `).run(now, step.step_id)
            unknownCommitSteps++
          } else if (op.status === "UNKNOWN_COMMIT") {
            this.db.prepare(`
              UPDATE quest_steps
              SET status = 'UNKNOWN_COMMIT',
                  error_code = 'UNKNOWN_COMMIT',
                  error_message = 'Step operation ended in UNKNOWN_COMMIT in ledger. Automated replay blocked.',
                  updated_at = ?
              WHERE step_id = ?
            `).run(now, step.step_id)
            unknownCommitSteps++
          } else if (op.status === "SUCCEEDED") {
            const sanitizedResult = serializeAndSanitize(op.resultPayload)
            this.db.prepare(`
              UPDATE quest_steps
              SET status = 'SUCCEEDED',
                  result_payload = ?,
                  error_code = NULL,
                  error_message = NULL,
                  updated_at = ?,
                  completed_at = ?
              WHERE step_id = ?
            `).run(sanitizedResult, now, now, step.step_id)
            recoveredSteps++
          } else if (op.status === "FAILED_FINAL") {
            this.db.prepare(`
              UPDATE quest_steps
              SET status = 'FAILED',
                  error_code = ?,
                  error_message = ?,
                  updated_at = ?,
                  completed_at = ?
              WHERE step_id = ?
            `).run(op.errorCode ?? "FAILED", op.errorMessage ?? "Operation failed in ledger", now, now, step.step_id)
            failedSteps++
          } else if (op.status === "FAILED_RETRYABLE") {
            if (step.retry_count < step.max_retries) {
              this.db.prepare(`
                UPDATE quest_steps
                SET status = 'PENDING',
                    retry_count = retry_count + 1,
                    error_code = 'CRASH_RECOVERED',
                    error_message = 'Step was retryable in ledger. Reset to PENDING for safe restart.',
                    updated_at = ?
                WHERE step_id = ?
              `).run(now, step.step_id)
              recoveredSteps++
            } else {
              this.db.prepare(`
                UPDATE quest_steps
                SET status = 'FAILED',
                    error_code = 'MAX_RETRIES_EXCEEDED',
                    error_message = 'Retries exhausted upon crash recovery.',
                    updated_at = ?,
                    completed_at = ?
              `).run(now, now, step.step_id)
              failedSteps++
            }
          } else if (op.status === "RUNNING") {
            if (op.actionClass === "READ_ONLY") {
              this.db.prepare(`
                UPDATE quest_steps
                SET status = 'PENDING',
                    error_code = 'CRASH_RECOVERED',
                    error_message = 'Read-only operation interrupted. Reset to PENDING.',
                    updated_at = ?
                WHERE step_id = ?
              `).run(now, step.step_id)
              recoveredSteps++
            } else {
              this.db.prepare(`
                UPDATE quest_steps
                SET status = 'UNKNOWN_COMMIT',
                    error_code = 'UNKNOWN_COMMIT',
                    error_message = 'Running mutation interrupted during process termination. UNKNOWN_COMMIT.',
                    updated_at = ?
              `).run(now, step.step_id)
              unknownCommitSteps++
            }
          }
        } else {
          this.db.prepare(`
            UPDATE quest_steps
            SET status = 'PENDING',
                error_code = 'CRASH_RECOVERED',
                error_message = 'Step was running when process terminated. Reset to PENDING for safe restart.',
                updated_at = ?
            WHERE step_id = ?
          `).run(now, step.step_id)
          recoveredSteps++
        }
      }

      return {
        recoveredQuests: runningQuests.length,
        suspendedQuests: questRes.changes,
        recoveredSteps,
        failedSteps,
        unknownCommitSteps,
      }
    })

    return recoveryTx()
  }

  // --- Private Helpers ---

  private getQuestRow(questId: QuestId): RawQuestRow | undefined {
    const stmt = this.db.prepare("SELECT * FROM quests WHERE quest_id = ?")
    return stmt.get(questId) as RawQuestRow | undefined
  }

  private getStepRow(stepId: StepId): RawQuestStepRow | undefined {
    const stmt = this.db.prepare("SELECT * FROM quest_steps WHERE step_id = ?")
    return stmt.get(stepId) as RawQuestStepRow | undefined
  }

  private mapRawQuest(raw: RawQuestRow): QuestRecord {
    return {
      questId: asQuestId(raw.quest_id),
      sessionId: raw.session_id,
      title: raw.title,
      prompt: raw.prompt,
      status: raw.status as QuestStatus,
      metadata: parseSanitized(raw.metadata),
      resultSummary: raw.result_summary,
      errorMessage: raw.error_message,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      completedAt: raw.completed_at,
    }
  }

  private mapRawStep(raw: RawQuestStepRow): QuestStepRecord {
    return {
      stepId: asStepId(raw.step_id),
      questId: asQuestId(raw.quest_id),
      stepIndex: raw.step_index,
      title: raw.title,
      capabilityId: raw.capability_id as CapabilityId,
      status: raw.status as QuestStepStatus,
      operationId: raw.operation_id ? (raw.operation_id as OperationId) : null,
      inputPayload: parseSanitized(raw.input_payload),
      resultPayload: parseSanitized(raw.result_payload),
      errorCode: raw.error_code,
      errorMessage: raw.error_message,
      dependencies: raw.dependencies ? JSON.parse(raw.dependencies) : [],
      retryCount: raw.retry_count,
      maxRetries: raw.max_retries,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      completedAt: raw.completed_at,
    }
  }
}

export const questEngine = new QuestEngine()
