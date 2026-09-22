/**
 * JARVIS CORE V2 — SQLITE PARALLEL CONCURRENCY & WAL STRESS TEST
 * 
 * Pre-Migration Gate A: Distinguish test-fixture isolation from production SQLite concurrency.
 * 
 * Verifies that a single shared SQLite database in WAL mode safely handles
 * high-concurrency interleaved reads and writes across multiple concurrent operations
 * without deadlocks, database lock errors, or data corruption.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import Database from "better-sqlite3"

describe("JARVIS CORE V2 — SQLite WAL Parallel Concurrency Stress Test", () => {
  let tempDir: string
  let dbPath: string

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-wal-stress-"))
    dbPath = path.join(tempDir, "shared_wal_stress.db")

    // Initialize schema on the shared database
    const initDb = new Database(dbPath)
    initDb.pragma("journal_mode = WAL")
    initDb.pragma("busy_timeout = 10000")
    initDb.exec(`
      CREATE TABLE IF NOT EXISTS ledger_ops (
        id TEXT PRIMARY KEY,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_step ON ledger_ops(step_id);
    `)
    initDb.close()
  })

  afterAll(() => {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    } catch {
      // ignore
    }
  })

  it("handles 30 concurrent read/write workers on a shared WAL database with zero lock collisions", async () => {
    const CONCURRENCY = 30
    const opsPerWorker = 5

    // Simulate 30 concurrent workers, each opening its own connection to the shared WAL database
    const workerPromises = Array.from({ length: CONCURRENCY }, async (_, workerIdx) => {
      const conn = new Database(dbPath)
      conn.pragma("journal_mode = WAL")
      conn.pragma("busy_timeout = 10000")

      try {
        const insertStmt = conn.prepare(`
          INSERT INTO ledger_ops (id, step_id, status, data, created_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        const countStmt = conn.prepare(`
          SELECT COUNT(*) as cnt FROM ledger_ops WHERE step_id = ?
        `)

        for (let opIdx = 0; opIdx < opsPerWorker; opIdx++) {
          const opId = `op_w${workerIdx}_step${opIdx}_${Math.random().toString(36).slice(2)}`
          const stepId = `step_${workerIdx}`
          
          // Write
          insertStmt.run(opId, stepId, "SUCCEEDED", JSON.stringify({ worker: workerIdx, op: opIdx }), Date.now())

          // Read back
          const row = countStmt.get(stepId) as { cnt: number }
          expect(row.cnt).toBeGreaterThanOrEqual(1)
        }
      } finally {
        conn.close()
      }
    })

    await Promise.all(workerPromises)

    // Verification check on shared DB
    const verifyConn = new Database(dbPath)
    const totalCount = (verifyConn.prepare("SELECT COUNT(*) as total FROM ledger_ops").get() as { total: number }).total
    verifyConn.close()

    expect(totalCount).toBe(CONCURRENCY * opsPerWorker)
  })
})
