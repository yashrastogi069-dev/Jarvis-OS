/**
 * JARVIS CORE V2 — PERSISTED QUEST SCHEMA
 * 
 * Checkpoint C8: Database schema definition and migration helper for quests and quest_steps.
 */

import type Database from "better-sqlite3"

export function initQuestSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quests (
      quest_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata TEXT,
      result_summary TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS quest_steps (
      step_id TEXT PRIMARY KEY,
      quest_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      status TEXT NOT NULL,
      operation_id TEXT,
      input_payload TEXT,
      result_payload TEXT,
      error_code TEXT,
      error_message TEXT,
      dependencies TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 2,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (quest_id) REFERENCES quests(quest_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quest_plans (
      plan_id TEXT PRIMARY KEY,
      quest_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      plan_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      superseded_at INTEGER,
      FOREIGN KEY (quest_id) REFERENCES quests(quest_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_quests_status ON quests(status);
    CREATE INDEX IF NOT EXISTS idx_quests_session ON quests(session_id);
    CREATE INDEX IF NOT EXISTS idx_quests_created_at ON quests(created_at);
    CREATE INDEX IF NOT EXISTS idx_quest_steps_quest ON quest_steps(quest_id);
    CREATE INDEX IF NOT EXISTS idx_quest_steps_status ON quest_steps(status);
    CREATE INDEX IF NOT EXISTS idx_quest_steps_operation ON quest_steps(operation_id);
    CREATE INDEX IF NOT EXISTS idx_quest_plans_quest ON quest_plans(quest_id);
    CREATE INDEX IF NOT EXISTS idx_quest_plans_status ON quest_plans(status);
  `)
}
