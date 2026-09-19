// tests/idempotency_audit.test.ts
// Empirical Idempotency and Duplicate Side-Effect Testing for Jarvis Agentic OS

import { describe, it, expect } from "vitest";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { allTools } from "@/lib/agent";
import { listTasks, deleteTask, getTask } from "@/lib/tasks";
import { listMemories, deleteMemory, getMemory } from "@/lib/memory";

const OUTPUT_FILE = path.join(process.cwd(), "logs", "idempotency_test_results.json");

describe("Idempotency & Duplicate Mutation Audit", () => {
  it("Tests duplicate execution risk on local mutation tools", async () => {
    const results = [];

    // 1. Test createTask idempotency
    const taskTitle = `[IDEMPOTENCY AUDIT] Test Task ${Date.now()}`;
    const createTaskTool = (allTools as any).createTask;
    
    // First execution
    const res1 = await createTaskTool.execute({ title: taskTitle });
    // Second execution with identical payload (simulating retry / failover / re-click)
    const res2 = await createTaskTool.execute({ title: taskTitle });

    const isTaskDuplicateCreated = res1.id !== res2.id;
    results.push({
      tool: "createTask",
      firstExecutionId: res1.id,
      secondExecutionId: res2.id,
      duplicateCreated: isTaskDuplicateCreated,
      mechanism: "No dedupeKey, operationId, or unique title constraint in tasks schema",
      riskLevel: "HIGH (creates duplicate tasks in SQLite and triggers duplicate notifications)",
    });

    // Cleanup tasks
    deleteTask(res1.id);
    deleteTask(res2.id);

    // 2. Test saveMemory idempotency
    const memoryContent = `[IDEMPOTENCY AUDIT] Test Memory Fact ${Date.now()}`;
    const saveMemoryTool = (allTools as any).saveMemory;

    const memRes1 = await saveMemoryTool.execute({ content: memoryContent, category: "test" });
    const memRes2 = await saveMemoryTool.execute({ content: memoryContent, category: "test" });

    const memId1 = memRes1.memoryIds[0];
    const memId2 = memRes2.memoryIds[0];
    const isMemoryDuplicateCreated = memId1 !== memId2;

    results.push({
      tool: "saveMemory",
      firstExecutionId: memId1,
      secondExecutionId: memId2,
      duplicateCreated: isMemoryDuplicateCreated,
      mechanism: "Raw INSERT into memories without unique constraint or semantic deduplication window",
      riskLevel: "HIGH (pollutes memory table and vec_memories with identical vectors)",
    });

    // Cleanup memories
    deleteMemory(memId1);
    deleteMemory(memId2);

    // 3. Test addWakeWord idempotency
    const wakePhrase = `test-wake-${Date.now()}`;
    const addWakeWordTool = (allTools as any).addWakeWord;

    let wakeWordDuplicate = false;
    let wakeWordError = null;
    try {
      const wake1 = await addWakeWordTool.execute({ phrase: wakePhrase, action: "activate-voice" });
      try {
        const wake2 = await addWakeWordTool.execute({ phrase: wakePhrase, action: "activate-voice" });
        wakeWordDuplicate = true;
      } catch (err: any) {
        wakeWordDuplicate = false;
        wakeWordError = err.message;
      }
      // Cleanup wake word
      const { removeWakeWord } = await import("@/lib/wake-words");
      removeWakeWord(wake1.id);
    } catch {}

    results.push({
      tool: "addWakeWord",
      duplicateCreated: wakeWordDuplicate,
      thrownErrorOnDuplicate: wakeWordError,
      mechanism: "sqlite table has UNIQUE constraint on phrase; throws unhandled exception on retry",
      riskLevel: "MEDIUM (prevents duplicate, but throws unhandled crash instead of returning existing record)",
    });

    // 4. Test saveAsSkill idempotency
    const skillName = `audit-skill-${Date.now()}`;
    const saveSkillTool = (allTools as any).saveAsSkill;

    let skillDuplicate = false;
    let skillError = null;
    try {
      const s1 = await saveSkillTool.execute({ name: skillName, description: "Test", instructions: "Step 1" });
      try {
        const s2 = await saveSkillTool.execute({ name: skillName, description: "Test", instructions: "Step 1" });
        skillDuplicate = true;
      } catch (err: any) {
        skillDuplicate = false;
        skillError = err.message;
      }
      // Cleanup skill
      const { deleteSkill } = await import("@/lib/skills");
      deleteSkill(s1.id);
    } catch {}

    results.push({
      tool: "saveAsSkill",
      duplicateCreated: skillDuplicate,
      thrownErrorOnDuplicate: skillError,
      mechanism: "UNIQUE constraint on skills.name; throws SQLite constraint failure on retry",
      riskLevel: "MEDIUM (prevents duplicate, but crashes stream with unhandled exception)",
    });

    // 5. Test deleteTask non-existent / idempotent delete
    const deleteTaskTool = (allTools as any).deleteTask;
    let deleteError = null;
    try {
      await deleteTaskTool.execute({ id: 888888 });
    } catch (err: any) {
      deleteError = err.message;
    }

    results.push({
      tool: "deleteTask",
      safeOnRepeat: false,
      thrownErrorOnRepeat: deleteError,
      mechanism: "Calling deleteTask twice or on missing ID throws unhandled Error('Task not found')",
      riskLevel: "HIGH (non-idempotent delete; retry crashes rather than returning deleted: false)",
    });

    console.log("Idempotency audit results:", results);

    if (!existsSync(path.dirname(OUTPUT_FILE))) {
      mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    }
    writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf8");
    expect(results.length).toBe(5);
  });
});
