/**
 * JARVIS CORE V2 — LOCAL CAPABILITY DEFINITIONS
 * 
 * Domain capabilities executing entirely on local machine / SQLite / AI Provider:
 * - Tasks (6 tools): tasks.create, tasks.list, tasks.complete, tasks.snooze, tasks.update, tasks.delete
 * - Memory (4 tools): memory.save, memory.recall, memory.list, memory.delete
 * - Skills (3 tools): skills.save, skills.list, skills.run
 * - Feed (1 tool): feed.get
 * - Wake Words (3 tools): wake_words.add, wake_words.list, wake_words.remove
 * - Preferences (1 tool): preferences.set
 * 
 * Total: 18 capabilities
 */

import { z } from "zod"
import { asCapabilityId } from "../../types"
import type { CapabilityDefinition } from "../types"
import { createTask, listTasks, completeTask, snoozeTask, updateTask, deleteTask } from "@/lib/tasks"
import { saveMemory, recallMemory, listMemories, deleteMemory, getMemory } from "@/lib/memory"
import { getRecentEvents } from "@/lib/events"
import { addWakeWord, listWakeWords, removeWakeWord } from "@/lib/wake-words"
import { setAssistantPreference } from "@/lib/assistant/prompt"

// ============================================================================
// 1. TASKS (6 capabilities)
// ============================================================================

export const taskCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("tasks.create"),
    legacyToolName: "createTask",
    domain: "tasks",
    title: "Create Task",
    description:
      "Create a task/reminder. Use when the user mentions anything time-bound ('remind me', 'by Friday', 'tomorrow morning') or asks you to track something to do.",
    inputSchema: z.object({
      title: z.string().describe("Short task title."),
      notes: z.string().optional().describe("Extra detail about the task."),
      dueAt: z.string().optional().describe("ISO datetime the task is due, if any."),
      remindAt: z.string().optional().describe("ISO datetime to remind the user, if any."),
      recurrence: z
        .enum(["daily", "weekdays", "weekly", "monthly"])
        .optional()
        .describe("Repeat rule, if this task recurs."),
    }),
    handler: async ({ title, notes, dueAt, remindAt, recurrence }) => {
      const task = createTask({
        title,
        notes,
        dueAt: dueAt ? new Date(dueAt).getTime() : undefined,
        remindAt: remindAt ? new Date(remindAt).getTime() : undefined,
        recurrence,
      })
      return { id: task.id, title: task.title, status: task.status }
    },
    actionClass: "LOCAL_CREATE",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: {
      idempotencyClass: "LEDGER_REQUIRED",
      naturalKey: ["title", "dueAt"],
      duplicateRisk: "HIGH: No dedupe key in SQLite schema; repeated executions create duplicate rows.",
    },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["task", "todo", "reminder", "remind", "schedule", "due"],
      domainHints: ["Tasks & reminders"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("tasks.list"),
    legacyToolName: "listTasks",
    domain: "tasks",
    title: "List Tasks",
    description: "List tasks, optionally filtered by status ('open' or 'done').",
    inputSchema: z.object({
      status: z.enum(["open", "done"]).optional(),
    }),
    handler: async ({ status }) => {
      const items = listTasks({ status })
      return {
        tasks: items.map((t) => ({
          id: t.id,
          title: t.title,
          notes: t.notes,
          status: t.status,
          dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null,
          remindAt: t.remindAt ? new Date(t.remindAt).toISOString() : null,
          recurrence: t.recurrence,
        })),
      }
    },
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["list tasks", "show tasks", "open tasks", "completed tasks", "todo list"],
      domainHints: ["Tasks & reminders"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("tasks.complete"),
    legacyToolName: "completeTask",
    domain: "tasks",
    title: "Complete Task",
    description:
      "Mark a task done by id. If the task recurs, a fresh open task for the next occurrence is created automatically.",
    inputSchema: z.object({
      id: z.number().int().describe("The task id."),
    }),
    handler: async ({ id }) => {
      const task = completeTask(id)
      return {
        id: task.id,
        status: task.status,
        completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
      }
    },
    actionClass: "LOCAL_UPDATE",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: {
      idempotencyClass: "NATURALLY_IDEMPOTENT",
      duplicateRisk: "In V1, throws unhandled Error if task already completed or non-existent.",
    },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["complete task", "done", "finish task", "mark done"],
      domainHints: ["Tasks & reminders"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("tasks.snooze"),
    legacyToolName: "snoozeTask",
    domain: "tasks",
    title: "Snooze Task",
    description: "Push a task's reminder forward by N minutes from now.",
    inputSchema: z.object({
      id: z.number().int().describe("The task id."),
      minutes: z.number().int().positive().describe("Minutes from now to re-remind."),
    }),
    handler: async ({ id, minutes }) => {
      const task = snoozeTask(id, minutes)
      return { id: task.id, remindAt: task.remindAt ? new Date(task.remindAt).toISOString() : null }
    },
    actionClass: "LOCAL_UPDATE",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "NATURALLY_IDEMPOTENT" },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["snooze", "delay reminder", "push back"],
      domainHints: ["Tasks & reminders"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("tasks.update"),
    legacyToolName: "updateTask",
    domain: "tasks",
    title: "Update Task",
    description: "Edit an existing task's title, notes, due date, reminder, or recurrence.",
    inputSchema: z.object({
      id: z.number().int().describe("The task id."),
      title: z.string().optional(),
      notes: z.string().optional(),
      dueAt: z.string().optional().describe("New ISO due datetime."),
      remindAt: z.string().optional().describe("New ISO reminder datetime."),
      recurrence: z.enum(["daily", "weekdays", "weekly", "monthly"]).optional(),
    }),
    handler: async ({ id, title, notes, dueAt, remindAt, recurrence }) => {
      const task = updateTask(id, {
        title,
        notes,
        dueAt: dueAt ? new Date(dueAt).getTime() : undefined,
        remindAt: remindAt ? new Date(remindAt).getTime() : undefined,
        recurrence,
      })
      return {
        id: task.id,
        title: task.title,
        dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
        remindAt: task.remindAt ? new Date(task.remindAt).toISOString() : null,
        recurrence: task.recurrence,
      }
    },
    actionClass: "LOCAL_UPDATE",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "NATURALLY_IDEMPOTENT" },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["edit task", "change task", "rename task", "reschedule"],
      domainHints: ["Tasks & reminders"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("tasks.delete"),
    legacyToolName: "deleteTask",
    domain: "tasks",
    title: "Delete Task",
    description: "Permanently delete a task by its numeric id. Use when the user asks to delete or remove a task.",
    inputSchema: z.object({
      id: z.number().int().describe("The task id to delete."),
    }),
    handler: async ({ id }) => {
      deleteTask(id)
      return { deleted: true, id }
    },
    actionClass: "LOCAL_DELETE",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      reason: "Irreversible deletion of user task records. Note: V1 executes without confirmation (known issue).",
    },
    idempotency: {
      idempotencyClass: "NATURALLY_IDEMPOTENT",
      duplicateRisk: "In V1, throws unhandled Error if task already deleted.",
    },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["delete task", "remove task", "clear task", "cancel task"],
      domainHints: ["Tasks & reminders"],
      promptVisibility: true,
    },
    userFacing: true,
  },
]

// ============================================================================
// 2. MEMORY (4 capabilities)
// ============================================================================

export const memoryCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("memory.save"),
    legacyToolName: "saveMemory",
    domain: "memory",
    title: "Save Memory",
    description:
      "Save important information about the user to long-term memory. REQUIRED whenever the user shares facts about themselves (name, pet, job, family, preferences) or explicitly asks you to 'remember', 'keep in mind', 'note down', or 'save' something. You MUST execute this tool to write the fact to the database — do not just reply that you remembered it without executing this tool.",
    inputSchema: z.object({
      content: z.string().describe("The information to remember, written as a clear standalone statement."),
      category: z
        .string()
        .optional()
        .describe("Category tag, e.g. 'preference', 'project', 'person', 'fact'. Defaults to 'general'."),
    }),
    handler: async ({ content, category }) => {
      const result = await saveMemory(content, { category, source: "chat" })
      return {
        saved: result.ids.length > 0,
        memoryIds: result.ids,
        semanticIndex: result.embedded,
      }
    },
    actionClass: "LOCAL_CREATE",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: {
      idempotencyClass: "LEDGER_REQUIRED",
      naturalKey: ["content"],
      duplicateRisk: "HIGH: In V1, repeat calls insert duplicate rows and duplicate vector embeddings.",
    },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["remember", "save fact", "keep in mind", "note down", "store memory"],
      domainHints: ["Long-term memory"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("memory.recall"),
    legacyToolName: "recallMemory",
    domain: "memory",
    title: "Recall Memory",
    description:
      "Search long-term memory for relevant context about the user using semantic search. Use when the user ASKS what you remember, or before answering questions that depend on past preferences or history. DO NOT use when the user is giving you a new fact to remember (use saveMemory instead).",
    inputSchema: z.object({
      query: z.string().describe("What to search for, phrased as a natural language query."),
      category: z.string().optional().describe("Optionally restrict to one category."),
    }),
    handler: async ({ query, category }) => {
      const results = await recallMemory(query, { limit: 6, category })
      return {
        memories: results.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          source: m.source,
          createdAt: new Date(m.createdAt).toISOString(),
        })),
      }
    },
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { localService: "sqlite-vec" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["what do you remember", "recall", "do you know my", "search memory"],
      domainHints: ["Long-term memory"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("memory.list"),
    legacyToolName: "listMemories",
    domain: "memory",
    title: "List Memories",
    description:
      "List stored long-term memories, most recent first, optionally filtered by category. Read-only — use this to audit what's remembered, find a memory's id before deleting it, or answer 'what do you remember about me' comprehensively (recallMemory only returns semantically relevant matches, not everything).",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional().describe("Max rows to return. Defaults to 20, capped at 100."),
      category: z.string().optional().describe("Optionally restrict to one category."),
    }),
    handler: async ({ limit, category }) => {
      const results = listMemories(limit ?? 20, category)
      return {
        memories: results.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          source: m.source,
          createdAt: new Date(m.createdAt).toISOString(),
        })),
      }
    },
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["list memories", "show memories", "all memories", "memory audit"],
      domainHints: ["Long-term memory"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("memory.delete"),
    legacyToolName: "deleteMemory",
    domain: "memory",
    title: "Delete Memory",
    description:
      "Permanently delete a stored memory by id (from listMemories or recallMemory), removing it from both the memory table and its search index so it can never resurface. Requires explicit confirmation: call with confirmed:false first, which returns the exact memory content that WOULD be deleted without touching anything — show that content to the user and only call again with confirmed:true after they explicitly approve deleting that specific memory in this turn or a prior turn.",
    inputSchema: z.object({
      id: z.number().int().min(1).describe("The memory id to delete, as returned by listMemories or recallMemory."),
      confirmed: z
        .boolean()
        .describe(
          "Set true ONLY after the user has explicitly approved deleting this exact memory in this turn or a prior turn of this conversation. If not yet confirmed, call with confirmed:false first to show them exactly what would be deleted, and wait for their explicit yes before calling again with confirmed:true.",
        ),
    }),
    handler: async ({ id, confirmed }) => {
      const existing = getMemory(id)
      if (!existing) {
        return { deleted: false, found: false, message: `No memory found with id ${id}.` }
      }
      if (!confirmed) {
        return {
          deleted: false,
          requiresConfirmation: true,
          preview: {
            id: existing.id,
            content: existing.content,
            category: existing.category,
            source: existing.source,
            createdAt: new Date(existing.createdAt).toISOString(),
          },
        }
      }
      deleteMemory(id)
      return { deleted: true, id }
    },
    actionClass: "LOCAL_DELETE",
    confirmation: {
      defaultPolicy: "REQUIRED",
      criticality: "HIGH",
      previewSupported: true,
      reason: "Permanent deletion of user long-term memory.",
    },
    idempotency: {
      idempotencyClass: "NATURALLY_IDEMPOTENT",
      duplicateRisk: "Safe: returns deleted: false if already deleted.",
    },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["forget", "delete memory", "remove memory", "erase memory"],
      domainHints: ["Long-term memory"],
      promptVisibility: true,
    },
    userFacing: true,
  },
]

// ============================================================================
// 3. SKILLS (3 capabilities)
// ============================================================================

export const skillCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("skills.save"),
    legacyToolName: "saveAsSkill",
    domain: "skills",
    title: "Save As Skill",
    description:
      "Turn a repeated task into a reusable skill. Use when the user says 'save this as a skill', 'automate this', or describes a task they do repeatedly. Write clear step-by-step instructions for performing the task.",
    inputSchema: z.object({
      name: z.string().describe("Short kebab-case skill name, e.g. 'pr-summary'."),
      description: z.string().describe("One-sentence description of what the skill does."),
      instructions: z
        .string()
        .describe("Complete step-by-step instructions for performing the task, written for an AI agent."),
    }),
    handler: async ({ name, description, instructions }) => {
      const { createSkill } = await import("@/lib/skills")
      const skill = createSkill({ name, description, instructions, sourceTask: "chat" })
      return { created: true, id: skill.id, name: skill.name, version: skill.version }
    },
    actionClass: "LOCAL_CREATE",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: {
      idempotencyClass: "LEDGER_REQUIRED",
      duplicateRisk: "In V1, throws UNIQUE constraint error on duplicate skill name.",
    },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["save skill", "create skill", "automate task", "save automation"],
      domainHints: ["Skill Factory"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("skills.list"),
    legacyToolName: "listSkills",
    domain: "skills",
    title: "List Skills",
    description: "List all skills in the Skill Factory with their status and version.",
    inputSchema: z.object({}),
    handler: async () => {
      const { listSkills } = await import("@/lib/skills")
      return {
        skills: listSkills().map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          status: s.status,
          version: s.version,
          deployedTo: s.deployedTo,
        })),
      }
    },
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["list skills", "show skills", "available automations"],
      domainHints: ["Skill Factory"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("skills.run"),
    legacyToolName: "runSkill",
    domain: "skills",
    title: "Run Skill",
    description: "Execute a skill by name with the given input, and log the run for the Loop Engine.",
    inputSchema: z.object({
      name: z.string().describe("The skill name."),
      input: z.string().describe("The input/task for this skill run."),
    }),
    handler: async ({ name, input }) => {
      const { runSkill } = await import("@/lib/skills")
      const { run } = await runSkill(name, input)
      return { runId: run.id, output: run.output }
    },
    actionClass: "SYSTEM_ACTION",
    confirmation: { defaultPolicy: "CONDITIONAL", criticality: "MEDIUM" },
    idempotency: { idempotencyClass: "UNKNOWN" },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["run skill", "execute skill", "trigger automation"],
      domainHints: ["Skill Factory"],
      promptVisibility: true,
    },
    userFacing: true,
  },
]

// ============================================================================
// 4. FEED (1 capability)
// ============================================================================

export const feedCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("feed.get"),
    legacyToolName: "getUpdatesFeed",
    domain: "feed",
    title: "Get Updates Feed",
    description:
      "Get recent events from connected services (GitHub notifications, PRs, issues, indexed notes). Use for 'what's new', 'brief me', or status questions.",
    inputSchema: z.object({
      source: z.string().optional().describe("Filter by source, e.g. 'github' or 'obsidian'."),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    handler: async ({ source, limit }) => {
      const items = getRecentEvents(limit ?? 30, source)
      return {
        events: items.map((e) => ({
          id: e.id,
          source: e.source,
          title: e.title,
          createdAt: new Date(e.createdAt).toISOString(),
          payload: e.payload,
        })),
      }
    },
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["brief me", "what's new", "updates", "activity feed", "status update"],
      domainHints: ["Updates feed"],
      promptVisibility: true,
    },
    userFacing: true,
  },
]

// ============================================================================
// 5. WAKE WORDS (3 capabilities)
// ============================================================================

export const wakeWordCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("wake_words.add"),
    legacyToolName: "addWakeWord",
    domain: "wake_words",
    title: "Add Wake Word",
    description:
      "Register a new wake word/phrase that activates an action when spoken aloud. Currently only the \"activate-voice\" action is wired to real behavior (it starts a voice conversation turn, same as saying 'Jarvis' or pressing Alt+J). Other action strings are reserved for future features — registering one now is safe and forward-compatible, but nothing will happen when it's spoken until a listener for that action id is built. Use when the user says things like \"add a wake word 'computer' for activating voice\" or \"let me say 'hey assistant' to talk to you\".",
    inputSchema: z.object({
      phrase: z.string().describe("The word or short phrase to listen for, e.g. 'computer' or 'hey jarvis'. Stored lowercased/trimmed."),
      action: z
        .string()
        .describe(
          "The action id to fire when this phrase is heard. Use 'activate-voice' to start a voice conversation turn (the only currently-wired action). Any other string is reserved for a future feature and will not do anything yet.",
        ),
    }),
    handler: async ({ phrase, action }) => {
      const entry = addWakeWord(phrase, action)
      return { id: entry.id, phrase: entry.phrase, action: entry.action, enabled: entry.enabled }
    },
    actionClass: "LOCAL_CREATE",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: {
      idempotencyClass: "LEDGER_REQUIRED",
      duplicateRisk: "In V1, throws unhandled Error on duplicate phrase.",
    },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["add wake word", "new wake word", "voice trigger", "spoken phrase"],
      domainHints: ["Wake words"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("wake_words.list"),
    legacyToolName: "listWakeWords",
    domain: "wake_words",
    title: "List Wake Words",
    description: "List all registered wake words/phrases, their target action, and whether each is enabled.",
    inputSchema: z.object({}),
    handler: async () => {
      return {
        wakeWords: listWakeWords().map((e) => ({
          id: e.id,
          phrase: e.phrase,
          action: e.action,
          enabled: e.enabled,
        })),
      }
    },
    actionClass: "READ_ONLY",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "READ_ONLY" },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["list wake words", "show wake words", "registered wake words"],
      domainHints: ["Wake words"],
      promptVisibility: true,
    },
    userFacing: true,
  },
  {
    id: asCapabilityId("wake_words.remove"),
    legacyToolName: "removeWakeWord",
    domain: "wake_words",
    title: "Remove Wake Word",
    description: "Delete a registered wake word by id. Use listWakeWords first if you need to find the id.",
    inputSchema: z.object({
      id: z.string().describe("The wake word entry id."),
    }),
    handler: async ({ id }) => {
      removeWakeWord(id)
      return { removed: true, id }
    },
    actionClass: "LOCAL_DELETE",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: {
      idempotencyClass: "NATURALLY_IDEMPOTENT",
      duplicateRisk: "In V1, throws unhandled Error on non-existent ID.",
    },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["remove wake word", "delete wake word"],
      domainHints: ["Wake words"],
      promptVisibility: true,
    },
    userFacing: true,
  },
]

// ============================================================================
// 6. PREFERENCES (1 capability)
// ============================================================================

export const preferenceCapabilities: ReadonlyArray<CapabilityDefinition> = [
  {
    id: asCapabilityId("preferences.set"),
    legacyToolName: "setPreference",
    domain: "preferences",
    title: "Set Assistant Preference",
    description:
      "Persist how the user wants the assistant to behave — tone, verbosity, or what name to call the user. Use ONLY when the user explicitly requests a change in behavior, such as 'be more casual' or 'call me boss'. NEVER call this tool when the user merely greets the assistant by its name (e.g. 'Hello Jarvis').",
    inputSchema: z.object({
      key: z.enum(["tone", "verbosity", "address"]),
      value: z.string().describe("For tone: professional/casual/warm/direct. For verbosity: brief/balanced/detailed. For address: what the assistant should call the USER (e.g. 'Boss', 'Alex'). NOT the assistant's name."),
    }),
    handler: async ({ key, value }) => {
      const prefs = setAssistantPreference(key, value)
      return { preferences: prefs }
    },
    actionClass: "LOCAL_UPDATE",
    confirmation: { defaultPolicy: "NONE", criticality: "LOW" },
    idempotency: { idempotencyClass: "NATURALLY_IDEMPOTENT" },
    requirements: { localService: "sqlite" },
    availability: {
      staticState: "AVAILABLE",
      isLocallyConfigured: () => ({ available: true }),
    },
    routing: {
      keywords: ["set tone", "be casual", "be professional", "call me", "verbosity", "assistant preference"],
      domainHints: ["Preferences"],
      promptVisibility: true,
    },
    userFacing: true,
  },
]

// Aggregate all 18 local capabilities
export const LOCAL_CAPABILITIES: ReadonlyArray<CapabilityDefinition> = [
  ...taskCapabilities,
  ...memoryCapabilities,
  ...skillCapabilities,
  ...feedCapabilities,
  ...wakeWordCapabilities,
  ...preferenceCapabilities,
]
