import { runTurn } from "./adversarial_audit.mjs"
import path from "node:path"
import { writeFileSync } from "node:fs"

const scenarios = [
  // A. SIMPLE CONVERSATION (Expected: No tools)
  {
    category: "A. Conversation",
    testName: "A1_Greeting",
    prompt: "Hello Jarvis.",
    expectedTools: [],
    expectedBehavior: "Polite concise greeting, no tools invoked",
  },
  {
    category: "A. Conversation",
    testName: "A2_General_Question",
    prompt: "What is 25 * 4?",
    expectedTools: [],
    expectedBehavior: "Direct answer 100, no tools",
  },
  {
    category: "A. Conversation",
    testName: "A3_Project_Explanation",
    prompt: "Explain what this project does in two sentences.",
    expectedTools: [],
    expectedBehavior: "Explains Agentic OS concisely, no tools",
  },

  // B. INTENT RECOGNITION (Different phrasings for saveMemory)
  {
    category: "B. Intent Recognition",
    testName: "B1_Direct_Remember",
    prompt: "Remember that I prefer dark roast coffee.",
    expectedTools: ["saveMemory"],
    expectedBehavior: "Calls saveMemory with dark roast preference",
  },
  {
    category: "B. Intent Recognition",
    testName: "B2_Casual_KeepInMind",
    prompt: "Keep in mind that my dog's name is Buster.",
    expectedTools: ["saveMemory"],
    expectedBehavior: "Calls saveMemory with dog's name",
  },
  {
    category: "B. Intent Recognition",
    testName: "B3_NoteDown_Fact",
    prompt: "Please note down: I work as a systems engineer.",
    expectedTools: ["saveMemory"],
    expectedBehavior: "Calls saveMemory with profession",
  },

  // C. SINGLE TOOL TASKS
  {
    category: "C. Single Tool",
    testName: "C1_List_Tasks",
    prompt: "What tasks do I have open right now?",
    expectedTools: ["listTasks"],
    expectedBehavior: "Calls listTasks",
  },
  {
    category: "C. Single Tool",
    testName: "C2_Create_Task",
    prompt: "Remind me to submit the tax return by next Friday at 5pm.",
    expectedTools: ["createTask"],
    expectedBehavior: "Calls createTask with due date and title",
  },
  {
    category: "C. Single Tool",
    testName: "C3_Web_Search",
    prompt: "Search the web: what is the latest stable version of Next.js?",
    expectedTools: ["webSearch"],
    expectedBehavior: "Calls webSearch with query",
  },
  {
    category: "C. Single Tool",
    testName: "C4_Recall_Memory",
    prompt: "What do you remember about my coffee preference?",
    expectedTools: ["recallMemory"],
    expectedBehavior: "Calls recallMemory or listMemories",
  },
  {
    category: "C. Single Tool",
    testName: "C5_Updates_Feed",
    prompt: "Brief me: what are the recent updates on my feed?",
    expectedTools: ["getUpdatesFeed"],
    expectedBehavior: "Calls getUpdatesFeed",
  },
  {
    category: "C. Single Tool",
    testName: "C6_List_Skills",
    prompt: "What skills are currently registered in the system?",
    expectedTools: ["listSkills"],
    expectedBehavior: "Calls listSkills",
  },

  // D. MULTI-TOOL SEQUENTIAL TASKS
  {
    category: "D. Multi-Tool",
    testName: "D1_Create_Verify_Task",
    prompt: "Create a task called 'Buy milk', and then list my open tasks to confirm it was created.",
    expectedTools: ["createTask", "listTasks"],
    expectedBehavior: "Calls createTask, then listTasks sequentially",
  },
  {
    category: "D. Multi-Tool",
    testName: "D2_Search_And_Save",
    prompt: "Find the release date of Next.js 15 on the web, and save that date into my long-term memory.",
    expectedTools: ["webSearch", "saveMemory"],
    expectedBehavior: "Calls webSearch, then saveMemory with found date",
  },

  // E. TOOL UNAVAILABLE / UNCONFIGURED
  {
    category: "E. Unavailable Tool",
    testName: "E1_GitHub_Notifications_NoKey",
    prompt: "Check my GitHub notifications.",
    expectedTools: ["getGithubNotifications"],
    expectedBehavior: "Invokes tool, catches missing token, informs user GITHUB_TOKEN is required",
  },
  {
    category: "E. Unavailable Tool",
    testName: "E2_Obsidian_Notes_NoVault",
    prompt: "Read my Obsidian note titled 'Daily.md'.",
    expectedTools: ["readNote"],
    expectedBehavior: "Invokes tool, catches unconfigured Obsidian, informs user plainly",
  },

  // F. ADVERSARIAL NON-TOOL (Should NOT trigger tools)
  {
    category: "F. Adversarial No-Tool",
    testName: "F1_Task_Topic_Discussion",
    prompt: "I am writing a blog post about how people organize tasks and reminders. Can you suggest 3 engaging talking points?",
    expectedTools: [],
    expectedBehavior: "No createTask or listTasks called; provides discussion outline",
  },
  {
    category: "F. Adversarial No-Tool",
    testName: "F2_Poem_About_Memory",
    prompt: "Write a short 4-line poem about human memory.",
    expectedTools: [],
    expectedBehavior: "No memory tools called; writes poem",
  },
  {
    category: "F. Adversarial No-Tool",
    testName: "F3_General_GitHub_Question",
    prompt: "What is the difference between a Git branch and a GitHub fork in software development?",
    expectedTools: [],
    expectedBehavior: "No GitHub tools called; explains Git concept",
  },

  // G. AMBIGUOUS REQUESTS
  {
    category: "G. Ambiguity",
    testName: "G1_Vague_Reminder",
    prompt: "Remind me later.",
    expectedTools: [],
    expectedBehavior: "Asks user WHAT to remind and WHEN, rather than inventing random tasks",
  },
]

async function runAll() {
  console.log(`[AUDIT] Starting evaluation of ${scenarios.length} production scenarios...`)
  const results = []

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i]
    console.log(`\n------------------------------------------------------------`)
    console.log(`[${i + 1}/${scenarios.length}] ${s.category} :: ${s.testName}`)
    console.log(`Prompt: "${s.prompt}"`)
    console.log(`Expected Tools: [${s.expectedTools.join(", ")}]`)

    const trace = await runTurn({
      testName: s.testName,
      messages: [{ id: `audit-${Date.now()}`, role: "user", content: s.prompt }],
      expectedTools: s.expectedTools,
      expectedBehavior: s.expectedBehavior,
    })

    const invoked = trace.toolInvocations.map((t) => t.toolName)
    console.log(`Actual Tools Invoked: [${invoked.join(", ")}]`)
    console.log(`Brain Used: ${trace.brain}`)
    console.log(`Latency: ${trace.totalLatencyMs}ms`)
    console.log(`Status: ${trace.pass ? "PASS" : "FAIL"}`)
    if (!trace.pass) {
      console.log(`Failure Reason: ${trace.failureReason}`)
    }
    console.log(`Response Snippet: "${trace.fullText.slice(0, 150).replace(/\n/g, " ")}..."`)

    results.push({
      ...s,
      pass: trace.pass,
      failureReason: trace.failureReason,
      actualTools: invoked,
      brain: trace.brain,
      latencyMs: trace.totalLatencyMs,
      fullText: trace.fullText,
      error: trace.error,
      traceId: trace.traceId,
    })

    // Small delay between turns to avoid local socket exhaustion
    await new Promise((r) => setTimeout(r, 500))
  }

  console.log(`\n============================================================`)
  console.log(`AUDIT RUN SUMMARY`)
  console.log(`============================================================`)
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Success Rate: ${Math.round((passed / results.length) * 100)}%`)

  const latencies = results.map((r) => r.latencyMs).filter(Boolean).sort((a, b) => a - b)
  const p50 = latencies[Math.floor(latencies.length * 0.5)]
  const p95 = latencies[Math.floor(latencies.length * 0.95)]
  const max = latencies[latencies.length - 1]
  console.log(`Latency: p50 = ${p50}ms | p95 = ${p95}ms | Max = ${max}ms`)

  // Save summary JSON
  const summaryPath = path.join(process.cwd(), "logs", "audit-traces", "summary.json")
  import("fs").then(({ writeFileSync }) => {
    writeFileSync(summaryPath, JSON.stringify({ results, p50, p95, max, passed, failed }, null, 2))
    console.log(`Full summary written to ${summaryPath}`)
  })
}

runAll().catch(console.error)
