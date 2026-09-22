import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import * as sqliteVec from "sqlite-vec"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

/**
 * Local-first SQLite database. Single file at ./data/agentic-os.db.
 * Self-initializes on first run — no migration step needed.
 *
 * sqlite-vec provides the vec_memories virtual table for vector search.
 * EMBEDDING_DIM matches Ollama's nomic-embed-text (768 dimensions).
 */
export const EMBEDDING_DIM = 768

const DB_DIR = path.join(process.cwd(), "data")

export function getDbPath(): string {
  return process.env.AGENTIC_OS_DB_PATH ?? path.join(DB_DIR, "agentic-os.db")
}

/**
 * Bump SCHEMA_VERSION whenever tables are added — the cached connection
 * (surviving HMR via globalThis) re-runs the idempotent DDL on mismatch.
 */
const SCHEMA_VERSION = 6

type GlobalWithDb = typeof globalThis & {
  __agenticOsDb?: Database.Database
  __agenticOsDbPath?: string
  __agenticOsDrizzle?: BetterSQLite3Database<typeof schema>
  __agenticOsVecAvailable?: boolean
  __agenticOsSchemaVersion?: number
}

const g = globalThis as GlobalWithDb

/** Add a column to an existing table only if it isn't already present. */
function ensureColumn(db: Database.Database, table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}

function initDb(targetPath = getDbPath()): Database.Database {
  if (targetPath !== ":memory:") {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  }
  const db = new Database(targetPath)
  if (targetPath !== ":memory:") {
    db.pragma("journal_mode = WAL")
  }

  let vecAvailable = false
  try {
    sqliteVec.load(db)
    vecAvailable = true
  } catch (error) {
    console.error(
      "[agentic-os] sqlite-vec failed to load — memory recall will fall back to keyword search.",
      error,
    )
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      source TEXT NOT NULL DEFAULT 'chat',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      payload TEXT,
      external_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external
      ON events (source, external_id);

    CREATE TABLE IF NOT EXISTS connector_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connector TEXT NOT NULL UNIQUE,
      config_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      instructions TEXT NOT NULL,
      source_task TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'built',
      version INTEGER NOT NULL DEFAULT 1,
      deployed_to TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skill_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id INTEGER NOT NULL,
      skill_version INTEGER NOT NULL DEFAULT 1,
      input TEXT NOT NULL,
      output TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 0,
      feedback TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_message TEXT NOT NULL,
      analyzed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'New conversation',
      summary TEXT,
      summary_through_message_id INTEGER,
      last_mode TEXT NOT NULL DEFAULT 'text',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      ui_parts TEXT,
      brain TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON chat_messages (session_id, id);

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      due_at INTEGER,
      remind_at INTEGER,
      recurrence TEXT,
      last_fired_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_reminder
      ON tasks (status, remind_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      dedupe_key TEXT NOT NULL UNIQUE,
      task_id INTEGER,
      payload TEXT,
      deliver_at INTEGER NOT NULL,
      expires_at INTEGER,
      channels TEXT NOT NULL DEFAULT '{}',
      acked_at INTEGER,
      snoozed_until INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_pending
      ON notifications (acked_at, deliver_at);

    CREATE TABLE IF NOT EXISTS voice_latency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_at INTEGER NOT NULL,
      vad_ms INTEGER NOT NULL,
      stt_ms INTEGER NOT NULL,
      brain_first_sentence_ms INTEGER NOT NULL,
      tts_first_chunk_ms INTEGER NOT NULL,
      total_ms INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_voice_latency_turn_at
      ON voice_latency (turn_at);
  `)

  // Idempotent column adds for tables that predate a column. `CREATE TABLE IF
  // NOT EXISTS` above never alters an existing table, so a column introduced in
  // a later SCHEMA_VERSION must be back-filled here for already-created DBs.
  ensureColumn(db, "notifications", "expires_at", "INTEGER")

  if (vecAvailable) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
        embedding float[${EMBEDDING_DIM}]
      );
    `)
  }

  g.__agenticOsVecAvailable = vecAvailable
  return db
}

export function getRawDb(): Database.Database {
  const currentPath = getDbPath()
  if (!g.__agenticOsDb || g.__agenticOsDbPath !== currentPath) {
    if (g.__agenticOsDb) {
      try {
        g.__agenticOsDb.close()
      } catch {
        // already closed
      }
    }
    g.__agenticOsDb = initDb(currentPath)
    g.__agenticOsDbPath = currentPath
    g.__agenticOsDrizzle = undefined
    g.__agenticOsSchemaVersion = SCHEMA_VERSION
  } else if (g.__agenticOsSchemaVersion !== SCHEMA_VERSION) {
    // Schema changed since this connection was cached (HMR) — close and re-init
    // so the idempotent DDL creates any new tables.
    try {
      g.__agenticOsDb.close()
    } catch {
      // already closed
    }
    g.__agenticOsDb = initDb(currentPath)
    g.__agenticOsDbPath = currentPath
    g.__agenticOsDrizzle = undefined
    g.__agenticOsSchemaVersion = SCHEMA_VERSION
  }
  return g.__agenticOsDb
}

export function closeRawDb(): void {
  if (g.__agenticOsDb) {
    try {
      g.__agenticOsDb.close()
    } catch {
      // already closed
    }
    g.__agenticOsDb = undefined
    g.__agenticOsDbPath = undefined
    g.__agenticOsDrizzle = undefined
  }
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!g.__agenticOsDrizzle) {
    g.__agenticOsDrizzle = drizzle(getRawDb(), { schema })
  }
  return g.__agenticOsDrizzle
}

export function isVecAvailable(): boolean {
  getRawDb()
  return g.__agenticOsVecAvailable ?? false
}

export { schema }
