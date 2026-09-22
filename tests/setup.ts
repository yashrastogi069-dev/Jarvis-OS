import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { afterAll } from "vitest"
import { closeRawDb } from "@/lib/db"

// Ensure test workers NEVER touch data/agentic-os.db
// Provide each worker / suite with an isolated temporary SQLite database in os.tmpdir()
const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2)}`
const testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `jarvis-test-${uniqueId}-`))
const testDbPath = path.join(testTmpDir, "isolated_agentic_os.db")
process.env.AGENTIC_OS_DB_PATH = testDbPath

afterAll(() => {
  try {
    closeRawDb()
  } catch {}
  try {
    fs.rmSync(testTmpDir, { recursive: true, force: true })
  } catch {}
})
