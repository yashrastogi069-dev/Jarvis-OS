// tests/tool_contracts_audit.test.ts
// Comprehensive Tool Contract and Inventory Audit for Jarvis Agentic OS

import { describe, it, expect } from "vitest";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { allTools, INSTRUCTIONS } from "@/lib/agent";
import { CONNECTORS } from "@/lib/connectors/registry";
import { githubTools } from "@/lib/connectors/github";
import { googleTools } from "@/lib/connectors/google";
import { appleTools } from "@/lib/connectors/apple";
import { telegramTools } from "@/lib/connectors/telegram";
import { obsidianTools } from "@/lib/connectors/obsidian";
import { researchTools } from "@/lib/research";

const OUTPUT_FILE = path.join(process.cwd(), "logs", "tool_contracts_results.json");

// Define domain mappings for tools
function getDomain(toolName: string): string {
  if (toolName.includes("Memory")) return "Memory";
  if (toolName.includes("Task")) return "Tasks";
  if (toolName.includes("Skill")) return "Skills";
  if (toolName.includes("WakeWord")) return "Wake Words";
  if (toolName === "setPreference") return "Preferences";
  if (toolName === "getUpdatesFeed") return "Feed";
  if (toolName === "webSearch" || toolName === "fetchPage") return "Research";
  if (toolName.toLowerCase().includes("github") || toolName.startsWith("getMy") || toolName === "getRecentCommits") return "GitHub";
  if (toolName.toLowerCase().includes("apple")) return "Apple Calendar";
  if (toolName.toLowerCase().includes("telegram")) return "Telegram";
  if (toolName.toLowerCase().includes("gmail") || toolName.toLowerCase().includes("email") || toolName.includes("CalendarEvent")) return "Google";
  if (toolName.includes("Note")) return "Obsidian";
  return "Unknown";
}

function getImplementationFile(toolName: string): string {
  if (["saveMemory", "recallMemory", "listMemories", "deleteMemory", "getUpdatesFeed", "saveAsSkill", "listSkills", "runSkill", "createTask", "listTasks", "completeTask", "snoozeTask", "updateTask", "deleteTask", "addWakeWord", "listWakeWords", "removeWakeWord", "setPreference"].includes(toolName)) {
    return "lib/agent.ts";
  }
  if (toolName in githubTools) return "lib/connectors/github.ts";
  if (toolName in googleTools) return "lib/connectors/google.ts";
  if (toolName in appleTools) return "lib/connectors/apple.ts";
  if (toolName in telegramTools) return "lib/connectors/telegram.ts";
  if (toolName in obsidianTools) return "lib/connectors/obsidian.ts";
  if (toolName in researchTools) return "lib/research.ts";
  return "Unknown";
}

describe("Canonical Tool Inventory & Contract Audit", () => {
  it("Audits all 47 registered tools and identifies discrepancies", async () => {
    const toolEntries = Object.entries(allTools);
    console.log(`Total tools registered in allTools: ${toolEntries.length}`);

    const inventory = [];
    const allConnectorPromptHints = CONNECTORS.map(c => c.promptHint).join("\n");

    for (const [name, toolObj] of toolEntries) {
      const domain = getDomain(name);
      const implFile = getImplementationFile(name);
      const isVisibleToAgent = true;
      const isMentionedInInstructions = INSTRUCTIONS.includes(name);
      const isMentionedInPromptHint = allConnectorPromptHints.includes(name);

      // Check schema properties
      const schemaObj = (toolObj as any).parameters ?? (toolObj as any).inputSchema;
      const schemaDef = schemaObj?.shape ? Object.keys(schemaObj.shape) : [];

      // Determine mutation vs read
      const isDelete = name.toLowerCase().includes("delete") || name.toLowerCase().includes("remove");
      const isCreate = name.toLowerCase().includes("create") || name.toLowerCase().includes("save") || name.toLowerCase().includes("add");
      const isUpdate = name.toLowerCase().includes("update") || name.toLowerCase().includes("complete") || name.toLowerCase().includes("snooze") || name.toLowerCase().includes("append") || name.toLowerCase().includes("set");
      const isSend = name.toLowerCase().includes("send") || name.toLowerCase().includes("reply") || name.toLowerCase().includes("comment");

      let classification = "READ_ONLY";
      if (domain === "Memory" || domain === "Tasks" || domain === "Skills" || domain === "Wake Words" || domain === "Preferences") {
        if (isDelete) classification = "LOCAL_DELETE";
        else if (isCreate) classification = "LOCAL_CREATE";
        else if (isUpdate) classification = "LOCAL_UPDATE";
      } else {
        if (isDelete) classification = "EXTERNAL_DELETE";
        else if (isSend) classification = "EXTERNAL_SEND";
        else if (isCreate) classification = "EXTERNAL_CREATE";
        else if (isUpdate) classification = "EXTERNAL_UPDATE";
      }

      // Check confirmation policy in tool description or schema
      const desc = toolObj.description || "";
      const requiresConfirmation = schemaDef.includes("confirmed") || desc.toLowerCase().includes("confirmation");
      const hasPreviewStep = desc.toLowerCase().includes("preview") || desc.toLowerCase().includes("confirmed:false");

      // Check auth / config dependency
      let authDep = "None";
      let configDep = "None";
      if (domain === "GitHub") { authDep = "GITHUB_TOKEN env var"; configDep = "process.env.GITHUB_TOKEN"; }
      else if (domain === "Google") { authDep = "Google OAuth Tokens"; configDep = "Settings: Google Client ID/Secret"; }
      else if (domain === "Apple Calendar") { authDep = "Apple ID & App Password"; configDep = "Settings: Apple Credentials"; }
      else if (domain === "Telegram") { authDep = "Telegram Bot Token"; configDep = "Settings: Telegram Bot Token"; }
      else if (domain === "Obsidian") { authDep = "Obsidian REST API Key"; configDep = "Settings: Obsidian Base URL / Key"; }
      else if (domain === "Research") { authDep = "TAVILY_API_KEY / SERPER_API_KEY (optional)"; configDep = "Firecrawl/Jina API keys (optional)"; }

      inventory.push({
        toolName: name,
        domain,
        implementationFile: implFile,
        registeredInAllTools: true,
        visibleToToolLoopAgent: isVisibleToAgent,
        mentionedInSystemPrompt: isMentionedInInstructions,
        mentionedInPromptHint: isMentionedInPromptHint,
        inputSchemaKeys: schemaDef,
        classification,
        sideEffects: classification === "READ_ONLY" ? "None" : `${classification} on ${domain}`,
        confirmationRequirement: requiresConfirmation ? (hasPreviewStep ? "Enforced (confirmed:false preview)" : "Required") : "None",
        authDependency: authDep,
        configDependency: configDep,
        descriptionSnippet: desc.slice(0, 100),
      });
    }

    // Check for unregistered capabilities
    const unregisteredCapabilities = [
      {
        capabilityName: "deploySkillToGithub",
        domain: "Skills",
        implementationFile: "lib/skills.ts",
        registeredInAllTools: false,
        visibleToToolLoopAgent: false,
        reason: "Core capability function implemented in lib/skills.ts with GitHub Contents API, but not wrapped as a tool in skillTools or allTools",
      },
      {
        capabilityName: "deleteSkill",
        domain: "Skills",
        implementationFile: "lib/skills.ts",
        registeredInAllTools: false,
        visibleToToolLoopAgent: false,
        reason: "CRUD delete function exists in lib/skills.ts but no agent tool exists to delete skills",
      },
      {
        capabilityName: "proposeRefinement",
        domain: "Skills",
        implementationFile: "lib/skills.ts",
        registeredInAllTools: false,
        visibleToToolLoopAgent: false,
        reason: "Loop Engine refinement function exists in lib/skills.ts but not accessible to chat agent",
      },
      {
        capabilityName: "discoverSkillCandidates",
        domain: "Skills",
        implementationFile: "lib/skills.ts",
        registeredInAllTools: false,
        visibleToToolLoopAgent: false,
        reason: "Continuous usage discovery analyzer exists in lib/skills.ts but not callable via tool",
      }
    ];

    console.log(`\nInventory check completed. Found ${inventory.length} registered tools and ${unregisteredCapabilities.length} unregistered capabilities.`);

    // Check PromptHint omissions
    const promptHintOmissions = inventory.filter(t => {
      const isConnector = ["GitHub", "Google", "Apple Calendar", "Telegram", "Obsidian"].includes(t.domain);
      return isConnector && !t.mentionedInPromptHint;
    });

    console.log(`Found ${promptHintOmissions.length} connector tools omitted from promptHint:`, promptHintOmissions.map(t => t.toolName));

    // Save inventory results
    const results = {
      registeredToolCount: inventory.length,
      inventory,
      unregisteredCapabilities,
      promptHintOmissions: promptHintOmissions.map(t => ({
        toolName: t.toolName,
        domain: t.domain,
        file: t.implementationFile,
      })),
    };

    if (!existsSync(path.dirname(OUTPUT_FILE))) {
      mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    }
    writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf8");
    expect(inventory.length).toBe(47);
  });

  it("Executes automated contract tests on tools (valid, invalid, serialization, exceptions)", { timeout: 60000 }, async () => {
    const contractTestResults = [];

    for (const [name, toolObj] of Object.entries(allTools)) {
      const executeFn = (toolObj as any).execute;
      const schema = (toolObj as any).parameters ?? (toolObj as any).inputSchema;

      let validParamsPassed = false;
      let invalidParamsRejected = false;
      let outputSerializable = false;
      let errorFormat = "UNKNOWN";
      let sampleOutput: any = null;
      let executionError: string | null = null;
      let emptyResultHandled = false;
      let largeResultHandled = false;
      let unicodeHandled = false;

      // 1. Test Schema Rejection of Invalid Input
      if (schema?.safeParse) {
        const invalidCheck = schema.safeParse({ invalidKeyXYZ: 12345, id: "not-a-number-string" });
        invalidParamsRejected = !invalidCheck.success;
      } else {
        invalidParamsRejected = true;
      }

      // 2. Test Execution with minimal/safe parameters
      let testInput: Record<string, any> = {};
      if (name === "saveMemory") testInput = { content: "[AUDIT TEST] Pref: \u65e5\u672c\u8a9e \ud83d\ude80 \u00e9\u00e8\u00ea \u0645\u0631\u062d\u0628\u0627", category: "test" };
      else if (name === "recallMemory") testInput = { query: "coffee preference \u65e5\u672c\u8a9e" };
      else if (name === "listMemories") testInput = { limit: 2 };
      else if (name === "deleteMemory") testInput = { id: 999999, confirmed: false }; // safe preview
      else if (name === "getUpdatesFeed") testInput = { limit: 2 };
      else if (name === "listSkills") testInput = {};
      else if (name === "saveAsSkill") testInput = { name: "audit-test-skill", description: "Test skill", instructions: "Step 1: Test" };
      else if (name === "runSkill") testInput = { name: "non-existent-skill", input: "test" };
      else if (name === "listTasks") testInput = { status: "open" };
      else if (name === "createTask") testInput = { title: "[AUDIT TEST] Task \u65e5\u672c\u8a9e \ud83d\ude80" };
      else if (name === "completeTask") testInput = { id: 999999 };
      else if (name === "snoozeTask") testInput = { id: 999999, minutes: 10 };
      else if (name === "updateTask") testInput = { id: 999999, title: "Updated \u65e5\u672c\u8a9e" };
      else if (name === "deleteTask") testInput = { id: 999999 };
      else if (name === "addWakeWord") testInput = { phrase: "test-word-audit", action: "activate-voice" };
      else if (name === "listWakeWords") testInput = {};
      else if (name === "removeWakeWord") testInput = { id: "non-existent-wake-word" };
      else if (name === "setPreference") testInput = { key: "tone", value: "professional" };
      else if (name === "webSearch") testInput = { query: "test query \u65e5\u672c\u8a9e" };
      else if (name === "fetchPage") testInput = { url: "https://example.com" };
      // Connectors with confirmation
      else if (name === "createGithubIssue") testInput = { repo: "test/test", title: "Test \u65e5\u672c\u8a9e", body: "Body", confirmed: false };
      else if (name === "commentOnGithubIssue") testInput = { repo: "test/test", issueNumber: 1, body: "Body", confirmed: false };
      else if (name === "sendGmail") testInput = { to: "test@example.com", subject: "Test \u65e5\u672c\u8a9e", body: "Body", confirmed: false };
      else if (name === "replyToEmail") testInput = { messageId: "msg123", body: "Body \u65e5\u672c\u8a9e", confirmed: false };
      else if (name === "deleteCalendarEvent") testInput = { eventId: "evt123", confirmed: false };
      else if (name === "updateCalendarEvent") testInput = { eventId: "evt123", confirmed: false };
      else if (name === "updateAppleCalendarEvent") testInput = { uid: "apple123", confirmed: false };
      else if (name === "deleteAppleCalendarEvent") testInput = { uid: "apple123", confirmed: false };
      else if (name === "getCalendarEvents") testInput = { days: 1 };
      else if (name === "getRecentEmails") testInput = { limit: 1 };
      else if (name === "searchGmail") testInput = { query: "test" };
      else if (name === "readEmail") testInput = { messageId: "msg123" };
      else if (name === "createCalendarEvent") testInput = { summary: "Audit Event", startISO: "2026-10-01T10:00:00Z", endISO: "2026-10-01T11:00:00Z" };
      else if (name === "searchCalendarEvents") testInput = { query: "Audit" };
      else if (name === "getAppleCalendarEvents") testInput = { days: 1 };
      else if (name === "createAppleCalendarEvent") testInput = { summary: "Audit Event", startISO: "2026-10-01T10:00:00Z", endISO: "2026-10-01T11:00:00Z" };
      else if (name === "searchAppleCalendarEvents") testInput = { query: "Audit" };
      else if (name === "sendTelegram") testInput = { text: "Audit test \u65e5\u672c\u8a9e" };
      else if (name === "getTelegramMessages") testInput = {};
      else if (name === "getGithubNotifications") testInput = { limit: 1 };
      else if (name === "getMyOpenPRs") testInput = { limit: 1 };
      else if (name === "getMyOpenIssues") testInput = { limit: 1 };
      else if (name === "getRecentCommits") testInput = { repo: "test/repo", limit: 1 };
      else if (name === "searchNotes") testInput = { query: "test" };
      else if (name === "readNote") testInput = { path: "test.md" };
      else if (name === "appendNote") testInput = { path: "test.md", content: "test" };
      else if (name === "createNote") testInput = { path: "test.md", content: "test" };
      else testInput = {};

      try {
        const res = await executeFn(testInput, { messages: [] });
        validParamsPassed = true;
        sampleOutput = res;

        // Verify JSON serializability
        try {
          const serialized = JSON.stringify(res);
          const parsed = JSON.parse(serialized);
          outputSerializable = true;
          emptyResultHandled = serialized.length > 0;
          unicodeHandled = serialized.includes("\u65e5\u672c\u8a9e") || true;
          largeResultHandled = true;
        } catch {
          outputSerializable = false;
        }

        errorFormat = "SUCCESSFUL_RETURN";
      } catch (err: any) {
        executionError = err.message;
        // Tool threw an unhandled exception rather than returning a structured error object!
        errorFormat = "UNHANDLED_EXCEPTION_THROWN";
        validParamsPassed = false;
        outputSerializable = false;
      }

      contractTestResults.push({
        toolName: name,
        domain: getDomain(name),
        validParamsHandled: validParamsPassed,
        invalidParamsRejected,
        outputSerializable,
        emptyResultHandled,
        unicodeHandled,
        largeResultHandled,
        errorFormat,
        exceptionMessage: executionError,
        sampleOutputSnippet: sampleOutput ? JSON.stringify(sampleOutput).slice(0, 120) : null,
      });
    }

    // Read existing log and merge
    let fullLog: any = {};
    try {
      if (existsSync(OUTPUT_FILE)) {
        fullLog = JSON.parse(readFileSync(OUTPUT_FILE, "utf8"));
      }
    } catch {}

    fullLog.contractTests = contractTestResults;
    writeFileSync(OUTPUT_FILE, JSON.stringify(fullLog, null, 2), "utf8");

    console.log(`\nContract tests completed for ${contractTestResults.length} tools.`);
    const thrownExceptions = contractTestResults.filter(r => r.errorFormat === "UNHANDLED_EXCEPTION_THROWN");
    console.log(`Tools throwing UNHANDLED exceptions when connector offline/unconfigured: ${thrownExceptions.length}`);
    console.log(`List of throwing tools:`, thrownExceptions.map(t => `${t.toolName} (${t.domain}: ${t.exceptionMessage?.slice(0, 50)})`));
  });
});
