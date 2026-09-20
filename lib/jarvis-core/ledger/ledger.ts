/**
 * JARVIS CORE V2 — PERSISTENT OPERATION LEDGER ENGINE
 * 
 * Checkpoint: C5 (Sections C5.1 – C5.12)
 * Status: Authoritative SQLite Operation Ledger & Logical Idempotency Manager
 * 
 * Invariants:
 * 1. Runtime-Owned Ledger: Operations are tracked in SQLite with deterministic schema.
 * 2. Claim-Before-Execute: Atomically claims operations before executing handlers.
 * 3. Logical Idempotency: Idempotent operations within window return cached results.
 * 4. Concurrent Execution Guard: Concurrent calls for running operations yield CONFLICT.
 * 5. UNKNOWN_COMMIT Protection: Uncertain connector outcomes block automated replays.
 * 6. Crash Recovery: Recovers orphaned RUNNING records to UNKNOWN_COMMIT or FAILED_RETRYABLE.
 * 7. Secret Redaction: Input and result payloads are sanitized before SQLite storage.
 */

import crypto from "node:crypto"
import type Database from "better-sqlite3"
import { getRawDb } from "../../db"
import type { CapabilityId, ActionClass, JsonValue } from "../types"
import { toJsonValue } from "../capabilities/json"
import { sanitizeSecrets } from "../capabilities/normalizer"
import {
  type OperationRecord,
  type OperationStatus,
  type OperationClaimResult,
  type ClaimOperationOptions,
  type CompleteOperationOptions,
  type FailOperationOptions,
  asOperationId,
  asDedupeKey,
  type OperationId,
  type DedupeKey,
} from "./types"
import { computeDedupeKey, hashCanonicalInput } from "./canonical"

export const DEFAULT_IDEMPOTENT_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours

interface RawOperationRow {
  operation_id: string
  dedupe_key: string
  capability_id: string
  action_class: string
  status: string
  input_hash: string
  input_payload: string | null
  result_payload: string | null
  error_code: string | null
  error_message: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
  quest_id: string | null
  step_id: string | null
}

export class OperationLedger {
  private readonly db: Database.Database

  constructor(injectedDb?: Database.Database) {
    this.db = injectedDb ?? getRawDb()
    this.initSchema()
  }

  /**
   * Initialize operations table and performance indexes idempotently.
   */
  public initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operations (
        operation_id TEXT PRIMARY KEY,
        dedupe_key TEXT NOT NULL,
        capability_id TEXT NOT NULL,
        action_class TEXT NOT NULL,
        status TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        input_payload TEXT,
        result_payload TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        quest_id TEXT,
        step_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_operations_dedupe_key ON operations(dedupe_key);
      CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
      CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at);
    `)
  }

  /**
   * Crash Recovery: Clean up orphaned RUNNING or PENDING operations on boot.
   * External mutations become UNKNOWN_COMMIT; local mutations become FAILED_RETRYABLE.
   */
  public recoverCrashedOperations(): number {
    const rows = this.db
      .prepare(
        `SELECT operation_id, action_class FROM operations WHERE status IN ('RUNNING', 'PENDING')`,
      )
      .all() as Array<{ operation_id: string; action_class: string }>

    if (rows.length === 0) return 0

    const now = Date.now()
    const updateStmt = this.db.prepare(
      `UPDATE operations SET status = ?, error_message = ?, updated_at = ? WHERE operation_id = ?`,
    )

    const recoverTx = this.db.transaction((records: typeof rows) => {
      for (const row of records) {
        const isReadOnly = row.action_class === "READ_ONLY"
        const isSafeToRetry = isReadOnly

        const newStatus: OperationStatus = isSafeToRetry ? "FAILED_RETRYABLE" : "UNKNOWN_COMMIT"
        const msg = isSafeToRetry
          ? "Process terminated while read/idempotent operation was in progress (crash recovery to FAILED_RETRYABLE)."
          : `Process terminated while mutation (${row.action_class}) was in progress without atomic commit verification (crash recovery to UNKNOWN_COMMIT).`

        updateStmt.run(newStatus, msg, now, row.operation_id)
      }
    })

    recoverTx(rows)
    return rows.length
  }

  /**
   * Attempt to claim an operation before execution.
   * Guarantees logical idempotency, concurrent execution conflict prevention,
   * argument hash integrity checking, and UNKNOWN_COMMIT safety inside an atomic SQLite transaction.
   */
  public claimOperation(options: ClaimOperationOptions): OperationClaimResult {
    const {
      operationId: providedOpId,
      capabilityId,
      actionClass,
      idempotencyClass,
      input,
      actor = "user",
      questId,
      stepId,
    } = options

    const inputHash = hashCanonicalInput(input)

    const claimTx = this.db.transaction((): OperationClaimResult => {
      // 1. If explicit runtime-owned operationId was provided:
      if (providedOpId) {
        const row = this.db
          .prepare(`SELECT * FROM operations WHERE operation_id = ?`)
          .get(providedOpId) as RawOperationRow | undefined

        if (row) {
          const existing = this.parseRow(row)

          // Section 3.2: Integrity verification! If same OperationId + different argument hash -> CONFLICT
          if (existing.inputHash !== inputHash) {
            return {
              status: "CONFLICT",
              reason: `Invariant violation: Operation ${providedOpId} previously claimed with different canonical argument hash.`,
              operationId: providedOpId,
            }
          }

          // If in progress
          if (existing.status === "RUNNING" || existing.status === "PENDING") {
            return {
              status: "CONFLICT",
              reason: `Operation is already in progress (${existing.status}). Concurrent duplicate blocked.`,
              operationId: providedOpId,
            }
          }

          // If UNKNOWN_COMMIT -> Block automatic replay
          if (existing.status === "UNKNOWN_COMMIT") {
            return {
              status: "UNKNOWN_COMMIT",
              reason: "Previous attempt ended with uncertain state (UNKNOWN_COMMIT). Automatic replay blocked.",
              operationId: providedOpId,
            }
          }

          // If SUCCEEDED: return cached result
          if (existing.status === "SUCCEEDED") {
            return {
              status: "CACHED",
              record: existing,
              resultPayload: existing.resultPayload ?? null,
            }
          }

          // If FAILED_FINAL: block duplicate
          if (existing.status === "FAILED_FINAL") {
            return {
              status: "FAILED_FINAL",
              reason: existing.errorMessage ?? "Previous operation failed permanently.",
              operationId: providedOpId,
            }
          }

          // If FAILED_RETRYABLE: allow retry of the same logical operation!
          if (existing.status === "FAILED_RETRYABLE") {
            const now = Date.now()
            this.db
              .prepare(`UPDATE operations SET status = 'RUNNING', updated_at = ? WHERE operation_id = ?`)
              .run(now, providedOpId)

            return {
              status: "CLAIMED",
              operationId: providedOpId,
              dedupeKey: existing.dedupeKey,
            }
          }
        }

        // OperationId provided, but not in DB yet -> claim it as a new operation!
        const dedupeKey = asDedupeKey(`dk_${providedOpId}`)
        const now = Date.now()
        let sanitizedInputJson: string | null = null
        try {
          const safeInput = toJsonValue(input)
          sanitizedInputJson = sanitizeSecrets(JSON.stringify(safeInput))
        } catch {
          sanitizedInputJson = null
        }

        this.db
          .prepare(
            `INSERT INTO operations (
              operation_id, dedupe_key, capability_id, action_class, status,
              input_hash, input_payload, created_at, updated_at, quest_id, step_id
            ) VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            providedOpId,
            dedupeKey,
            capabilityId,
            actionClass,
            inputHash,
            sanitizedInputJson,
            now,
            now,
            questId ?? null,
            stepId ?? null,
          )

        return {
          status: "CLAIMED",
          operationId: providedOpId,
          dedupeKey,
        }
      }

      // 2. If no operationId was provided, fallback to dedupeKey lookup for backward compatibility:
      const dedupeKey = computeDedupeKey({
        capabilityId,
        actionClass,
        idempotencyClass,
        input,
        actor,
      })

      const isIdempotent =
        idempotencyClass === "NATURALLY_IDEMPOTENT" ||
        idempotencyClass === "READ_ONLY" ||
        idempotencyClass === "LEDGER_REQUIRED" ||
        idempotencyClass === "REMOTE_IDEMPOTENCY_SUPPORTED"

      const windowMs =
        options.idempotencyWindowMs !== undefined
          ? options.idempotencyWindowMs
          : isIdempotent
            ? DEFAULT_IDEMPOTENT_WINDOW_MS
            : 0

      // Find latest record with this dedupe_key
      const row = this.db
        .prepare(
          `SELECT * FROM operations WHERE dedupe_key = ? ORDER BY created_at DESC LIMIT 1`,
        )
        .get(dedupeKey) as RawOperationRow | undefined

      if (row) {
        const existing = this.parseRow(row)
        const ageMs = Date.now() - existing.createdAt

        // 1. If currently RUNNING or PENDING -> CONFLICT
        if (existing.status === "RUNNING" || existing.status === "PENDING") {
          return {
            status: "CONFLICT",
            reason: `Operation is already in progress (${existing.status}). Concurrent duplicate blocked.`,
            operationId: existing.operationId,
          }
        }

        // 2. If UNKNOWN_COMMIT -> Block automatic replay
        if (existing.status === "UNKNOWN_COMMIT") {
          return {
            status: "UNKNOWN_COMMIT",
            reason: "Previous attempt ended with uncertain external state (UNKNOWN_COMMIT). Automatic replay blocked.",
            operationId: existing.operationId,
          }
        }

        // 3. If SUCCEEDED: check idempotency and window
        if (existing.status === "SUCCEEDED") {
          if (isIdempotent) {
            if (ageMs <= windowMs) {
              return {
                status: "CACHED",
                record: existing,
                resultPayload: existing.resultPayload ?? null,
              }
            }
          } else if (windowMs > 0 && ageMs <= windowMs) {
            return {
              status: "CACHED",
              record: existing,
              resultPayload: existing.resultPayload ?? null,
            }
          }
        }

        // 4. If FAILED_FINAL: block duplicate
        if (existing.status === "FAILED_FINAL" && isIdempotent && ageMs <= windowMs) {
          return {
            status: "FAILED_FINAL",
            reason: existing.errorMessage ?? "Previous operation failed permanently.",
            operationId: existing.operationId,
          }
        }
      }

      // No matching record or window expired -> claim new operation
      const operationId = asOperationId(`op_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`)
      const now = Date.now()

      let sanitizedInputJson: string | null = null
      try {
        const safeInput = toJsonValue(input)
        sanitizedInputJson = sanitizeSecrets(JSON.stringify(safeInput))
      } catch {
        sanitizedInputJson = null
      }

      this.db
        .prepare(
          `INSERT INTO operations (
            operation_id, dedupe_key, capability_id, action_class, status,
            input_hash, input_payload, created_at, updated_at, quest_id, step_id
          ) VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          operationId,
          dedupeKey,
          capabilityId,
          actionClass,
          inputHash,
          sanitizedInputJson,
          now,
          now,
          questId ?? null,
          stepId ?? null,
        )

      return {
        status: "CLAIMED",
        operationId,
        dedupeKey,
      }
    })

    return claimTx()
  }

  /**
   * Complete an operation successfully, storing sanitized result payload.
   */
  public completeOperation(options: CompleteOperationOptions): void {
    const { operationId, resultPayload } = options
    const now = Date.now()

    let sanitizedResultJson: string | null = null
    try {
      const safeResult = toJsonValue(resultPayload)
      sanitizedResultJson = sanitizeSecrets(JSON.stringify(safeResult))
    } catch {
      sanitizedResultJson = null
    }

    this.db
      .prepare(
        `UPDATE operations SET
          status = 'SUCCEEDED',
          result_payload = ?,
          updated_at = ?,
          completed_at = ?
        WHERE operation_id = ?`,
      )
      .run(sanitizedResultJson, now, now, operationId)
  }

  /**
   * Mark an operation as failed with retryable, final, or UNKNOWN_COMMIT classification.
   */
  public failOperation(options: FailOperationOptions): void {
    const { operationId, errorCode, errorMessage, isRetryable, isUnknownCommit } = options
    const now = Date.now()

    let status: OperationStatus = "FAILED_FINAL"
    if (isUnknownCommit) {
      status = "UNKNOWN_COMMIT"
    } else if (isRetryable) {
      status = "FAILED_RETRYABLE"
    }

    const sanitizedErrorMsg = sanitizeSecrets(errorMessage)

    this.db
      .prepare(
        `UPDATE operations SET
          status = ?,
          error_code = ?,
          error_message = ?,
          updated_at = ?,
          completed_at = ?
        WHERE operation_id = ?`,
      )
      .run(status, errorCode, sanitizedErrorMsg, now, now, operationId)
  }

  /**
   * Retrieve an operation record by ID.
   */
  public getOperation(operationId: OperationId | string): OperationRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM operations WHERE operation_id = ?`)
      .get(operationId) as RawOperationRow | undefined

    return row ? this.parseRow(row) : undefined
  }

  /**
   * Retrieve the latest operation record matching a dedupeKey.
   */
  public getOperationByDedupeKey(dedupeKey: DedupeKey | string): OperationRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM operations WHERE dedupe_key = ? ORDER BY created_at DESC LIMIT 1`)
      .get(dedupeKey) as RawOperationRow | undefined

    return row ? this.parseRow(row) : undefined
  }

  /**
   * Prune completed operations older than the specified retention threshold.
   */
  public pruneOldOperations(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs
    const res = this.db
      .prepare(
        `DELETE FROM operations WHERE status IN ('SUCCEEDED', 'FAILED_FINAL') AND created_at < ?`,
      )
      .run(cutoff)

    return res.changes
  }

  private parseRow(row: RawOperationRow): OperationRecord {
    let inputPayload: JsonValue | undefined
    let resultPayload: JsonValue | undefined

    if (row.input_payload) {
      try {
        inputPayload = JSON.parse(row.input_payload)
      } catch {
        inputPayload = undefined
      }
    }

    if (row.result_payload) {
      try {
        resultPayload = JSON.parse(row.result_payload)
      } catch {
        resultPayload = undefined
      }
    }

    return {
      operationId: asOperationId(row.operation_id),
      dedupeKey: asDedupeKey(row.dedupe_key),
      capabilityId: row.capability_id as CapabilityId,
      actionClass: row.action_class as ActionClass,
      status: row.status as OperationStatus,
      inputHash: row.input_hash,
      inputPayload,
      resultPayload,
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at ?? undefined,
      questId: row.quest_id ?? undefined,
      stepId: row.step_id ?? undefined,
    }
  }
}

// Global Singleton Instance
export const operationLedger = new OperationLedger()
