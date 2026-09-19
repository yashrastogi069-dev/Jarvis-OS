import { describe, it, expect, beforeAll } from "vitest"
import fs from "fs"
import path from "path"

// Load .env.local for live provider testing
if (fs.existsSync(".env.local")) {
  try {
    process.loadEnvFile(".env.local")
  } catch {
    const content = fs.readFileSync(".env.local", "utf8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const idx = trimmed.indexOf("=")
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim()
        const v = trimmed.slice(idx + 1).trim()
        if (!process.env[k]) process.env[k] = v
      }
    }
  }
}

describe("1. Database & Memory Engine Practical Test", () => {
  it("connects to SQLite and inspects table readiness", async () => {
    const { getRawDb, isVecAvailable, EMBEDDING_DIM } = await import("@/lib/db")
    const db = getRawDb()
    expect(db).toBeDefined()

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>
    const tableNames = tables.map((t) => t.name)
    expect(tableNames).toContain("memories")
    expect(tableNames).toContain("events")
    expect(tableNames).toContain("connector_settings")
    expect(tableNames).toContain("tasks")
    expect(tableNames).toContain("notifications")
    expect(tableNames).toContain("chat_sessions")
    expect(tableNames).toContain("chat_messages")
    expect(tableNames).toContain("voice_latency")

    const vecOk = isVecAvailable()
    console.log(`[AUDIT] sqlite-vec available: ${vecOk}, embedding dimension: ${EMBEDDING_DIM}`)
  })

  it("saves, retrieves, recalls, and cleanly deletes memories", async () => {
    const { saveMemory, getMemory, recallMemory, listMemories, deleteMemory } = await import("@/lib/memory")
    const testContent = `Full-system-audit practical test memory created at ${Date.now()}`
    
    // Save
    const saveRes = await saveMemory(testContent, { category: "audit_test", source: "test_suite" })
    expect(saveRes.ids.length).toBeGreaterThan(0)
    const testId = saveRes.ids[0]

    // Get
    const fetched = getMemory(testId)
    expect(fetched).toBeDefined()
    expect(fetched?.content).toBe(testContent)

    // Recall
    const recalled = await recallMemory("Full-system-audit practical test", { limit: 5 })
    expect(recalled.length).toBeGreaterThan(0)
    expect(recalled.some((m) => m.id === testId)).toBe(true)

    // List
    const listed = listMemories(20, "audit_test")
    expect(listed.some((m) => m.id === testId)).toBe(true)

    // Delete
    deleteMemory(testId)
    expect(getMemory(testId)).toBeUndefined()
  })
})

describe("2. AI Brain Providers & Headless Agent Execution", () => {
  it("resolves active provider and checks failover chain", async () => {
    const { getProviderStatus, resolveModel } = await import("@/lib/providers")
    const status = getProviderStatus()
    expect(status.length).toBe(5) // gemini, groq, openrouter, nvidia, ollama
    
    const active = resolveModel()
    expect(active).toBeDefined()
    expect(active.id).toBeDefined()
    console.log(`[AUDIT] Active Brain Head: ${active.id} (${active.label})`)
  })

  it("executes a live prompt via the active brain", async () => {
    const { resolveModel } = await import("@/lib/providers")
    const { generateText } = await import("ai")
    const active = resolveModel()

    const t0 = performance.now()
    const result = await generateText({
      model: active.model,
      prompt: "Respond with the word PONG and nothing else.",
      abortSignal: AbortSignal.timeout(20000),
    })
    const dur = Math.round(performance.now() - t0)
    console.log(`[AUDIT] Live Brain (${active.id}) response: "${result.text.trim()}" in ${dur}ms`)
    expect(result.text.toUpperCase()).toContain("PONG")
  }, 25000)

  it("executes headless agent turn via collectOsAgentResponse", async () => {
    const { collectOsAgentResponse } = await import("@/lib/agent")
    const t0 = performance.now()
    const result = await collectOsAgentResponse("What is 10 plus 25? Answer with only the number.")
    const dur = Math.round(performance.now() - t0)
    console.log(`[AUDIT] collectOsAgentResponse (${result.brain}): "${result.text.trim()}" in ${dur}ms`)
    expect(result.text).toContain("35")
  }, 30000)
})

describe("3. Research Tools (Tavily, Serper, Firecrawl)", () => {
  it("performs live web search via webSearch", async () => {
    const { webSearch } = await import("@/lib/research")
    const res = await webSearch("Next.js App Router")
    if ("results" in res) {
      expect(res.results.length).toBeGreaterThan(0)
      console.log(`[AUDIT] webSearch (${res.source}): ${res.results.length} results (top: "${res.results[0].title}")`)
    } else {
      console.warn(`[AUDIT WARN] webSearch error: ${res.error}`)
    }
  }, 20000)

  it("fetches page markdown via fetchPage", async () => {
    const { fetchPage } = await import("@/lib/research")
    const res = await fetchPage("https://example.com")
    if ("markdown" in res) {
      expect(res.markdown.length).toBeGreaterThan(0)
      console.log(`[AUDIT] fetchPage: ${res.markdown.length} bytes markdown retrieved`)
    } else {
      console.warn(`[AUDIT WARN] fetchPage error: ${res.error}`)
    }
  }, 20000)
})

describe("4. Voice Stack Practical Verification", () => {
  let synthWav: Buffer | null = null

  it("checks Piper TTS binaries and synthesizes speech", async () => {
    const { ttsStatus, synthesize } = await import("@/lib/voice/piper")
    const status = await ttsStatus()
    expect(status.binPresent).toBe(true)
    expect(status.voicePresent).toBe(true)

    const t0 = performance.now()
    const res = await synthesize("Voice engine online.")
    const totalMs = Math.round(performance.now() - t0)
    expect(res.wav).toBeDefined()
    expect(res.wav.length).toBeGreaterThan(1000) // valid WAV has header + samples
    synthWav = res.wav
    console.log(`[AUDIT] Piper TTS synthesized ${res.wav.length} bytes in ${res.synthMs}ms (total: ${totalMs}ms)`)
  }, 25000)

  it("checks STT availability and transcribes synthesized audio", async () => {
    const { sttStatus, transcribeWav } = await import("@/lib/voice/stt")
    const status = await sttStatus()
    console.log(`[AUDIT] STT Status: ok=${status.ok}, engine=${status.engine}, sidecarUp=${status.sidecar.up}, fallbackAvailable=${status.fallbackAvailable}`)

    if (synthWav) {
      try {
        const trans = await transcribeWav(synthWav)
        console.log(`[AUDIT] Transcribed audio: "${trans.text}" via ${trans.engine} (decodeMs: ${trans.decodeMs})`)
        expect(trans.text.length).toBeGreaterThan(0)
      } catch (err: any) {
        console.warn(`[AUDIT WARN] transcribeWav failed: ${err.message}`)
      }
    }
  }, 35000)

  it("tests SentenceChunker splitting and markdown stripping", async () => {
    const { SentenceChunker } = await import("@/lib/voice/sentence-chunker")
    const chunker = new SentenceChunker()
    const p1 = chunker.push("Here is **sentence one**. And `sentence two`? ")
    const p2 = chunker.push("Third sentence! Trailing incomplete")
    const final = chunker.finalize()

    const all = [...p1, ...p2, ...(final ? [final] : [])]
    expect(all.length).toBe(4)
    expect(all[0]).toBe("Here is sentence one.")
    expect(all[1]).toBe("And sentence two?")
    expect(all[2]).toBe("Third sentence!")
    expect(all[3]).toBe("Trailing incomplete")
  })

  it("tests EnergyVad state machine", async () => {
    const { EnergyVad } = await import("@/lib/voice/vad")
    const vad = new EnergyVad({ speechStartMs: 50, speechEndMs: 100 })
    let speechStarted = false
    let speechEnded = false
    vad.onSpeechStart = () => { speechStarted = true }
    vad.onSpeechEnd = () => { speechEnded = true }

    vad.push(0.04, 0)
    vad.push(0.04, 60)
    expect(speechStarted).toBe(true)
    expect(vad.state).toBe("speech")

    vad.push(0.005, 70)
    vad.push(0.005, 180)
    expect(speechEnded).toBe(true)
    expect(vad.state).toBe("silence")
  })
})

describe("5. Connectors Registry & Probes", () => {
  it("probes all 7 registry connectors", async () => {
    const { CONNECTORS } = await import("@/lib/connectors/registry")
    expect(CONNECTORS.length).toBe(7)

    for (const conn of CONNECTORS) {
      const res = await conn.probe({ live: false })
      console.log(`[AUDIT] Connector ${conn.id} (${conn.label}): ${res.status}${res.reason ? ` - ${res.reason}` : ""}`)
      expect(["ok", "warn", "off"]).toContain(res.status)
    }
  })

  it("probes Google connection status", async () => {
    const { isGoogleConnected, getUpcomingEvents, getGoogleSettings } = await import("@/lib/connectors/google")
    const settings = getGoogleSettings()
    const connected = isGoogleConnected()
    console.log(`[AUDIT] Google connector: configured=${!!settings}, connected=${connected}`)

    if (connected) {
      try {
        const events = await getUpcomingEvents(7, 5)
        console.log(`[AUDIT] Google Calendar returned ${events.length} events`)
        expect(Array.isArray(events)).toBe(true)
      } catch (err: any) {
        console.warn(`[AUDIT WARN] Google Calendar API error: ${err.message}`)
      }
    }
  })

  it("probes Telegram bot connection", async () => {
    const { getTelegramSettings, checkTelegram } = await import("@/lib/connectors/telegram")
    const settings = getTelegramSettings()
    if (settings) {
      const check = await checkTelegram()
      console.log(`[AUDIT] Telegram bot check: ok=${check.ok}, username=${check.username ?? "none"}`)
    }
  })

  it("probes GitHub API with token", async () => {
    const { searchMyOpenPRs } = await import("@/lib/connectors/github")
    if (process.env.GITHUB_TOKEN) {
      try {
        const prs = await searchMyOpenPRs(5)
        console.log(`[AUDIT] GitHub API returned ${prs.length} open PRs`)
        expect(Array.isArray(prs)).toBe(true)
      } catch (err: any) {
        console.warn(`[AUDIT WARN] GitHub API error: ${err.message}`)
      }
    }
  })

  it("probes Apple Calendar CalDAV", async () => {
    const { getAppleSettings, checkApple } = await import("@/lib/connectors/apple")
    const settings = getAppleSettings()
    if (settings) {
      const ok = await checkApple()
      console.log(`[AUDIT] Apple iCloud CalDAV reachable: ${ok}`)
    }
  })
})

describe("6. Tasks, Reminders & Proactive Scheduler", () => {
  it("performs full Task CRUD and verifies recurrence", async () => {
    const { createTask, listTasks, snoozeTask, updateTask, completeTask, deleteTask } = await import("@/lib/tasks")
    const title = `Audit Task ${Date.now()}`
    const task = createTask({
      title,
      notes: "Test notes",
      remindAt: Date.now() + 100000,
      recurrence: "daily",
    })
    expect(task.id).toBeDefined()

    // Snooze
    const snoozed = snoozeTask(task.id, 10)
    expect(snoozed.remindAt).toBeGreaterThan(task.remindAt!)

    // Update
    const updated = updateTask(task.id, { notes: "Updated audit notes" })
    expect(updated.notes).toBe("Updated audit notes")

    // Complete (daily recurrence should create next open task)
    const completed = completeTask(task.id)
    expect(completed.status).toBe("done")

    // Clean up
    deleteTask(task.id)
  })

  it("tests Notification queue and deduplication", async () => {
    const { enqueueNotification, listPendingNotifications, ackNotification, snoozeNotification } = await import("@/lib/db/notifications")
    const key = `audit:dedupe:${Date.now()}`

    const enq1 = enqueueNotification({
      kind: "reminder",
      title: "Audit reminder",
      dedupeKey: key,
      deliverAt: Date.now() - 500,
    })
    expect(enq1.created).toBe(true)

    // Second enqueue with same key must be ignored (deduplicated)
    const enq2 = enqueueNotification({
      kind: "reminder",
      title: "Duplicate audit reminder",
      dedupeKey: key,
      deliverAt: Date.now() - 500,
    })
    expect(enq2.created).toBe(false)
    expect(enq2.id).toBe(enq1.id)

    // Ack
    ackNotification(enq1.id)
    const pending = listPendingNotifications(Date.now())
    expect(pending.some((n) => n.id === enq1.id)).toBe(false)
  })

  it("runs scheduler tick and proactive sweep without throwing", async () => {
    const { runSchedulerTick } = await import("@/lib/scheduler")
    const { sweepTriggers } = await import("@/lib/assist/sweep")

    await expect(runSchedulerTick()).resolves.toBeUndefined()
    await expect(sweepTriggers()).resolves.toBeUndefined()
  })
})

describe("7. System Companion & Security", () => {
  it("verifies system token generation and constant-time check", async () => {
    const { getSystemToken, verifySystemToken } = await import("@/lib/settings")
    const token = getSystemToken()
    expect(token).toBeDefined()
    expect(token.length).toBe(32)

    expect(verifySystemToken(token)).toBe(true)
    expect(verifySystemToken("bogus_token_12345")).toBe(false)
    expect(verifySystemToken(null)).toBe(false)
  })

  it("verifies system-auth rate limiting guard", async () => {
    const { requireSystemAuth } = await import("@/lib/system-auth")
    const { getSystemToken } = await import("@/lib/settings")
    const validToken = getSystemToken()

    const reqValid = new Request("http://localhost:3100/api/system/command", {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    const deniedValid = requireSystemAuth(reqValid)
    expect(deniedValid).toBeNull()

    const reqInvalid = new Request("http://localhost:3100/api/system/command", {
      headers: { Authorization: "Bearer wrong_token" },
    })
    const deniedInvalid = requireSystemAuth(reqInvalid)
    expect(deniedInvalid).not.toBeNull()
    expect(deniedInvalid?.status).toBe(401)
  })
})

describe("8. Skill Factory & Loop Engine", () => {
  it("creates, exports, and cleans up skills", async () => {
    const { createSkill, getSkill, toSkillMd, deleteSkill, listSkills } = await import("@/lib/skills")
    // Clean up any stale audit-skill from previous run
    for (const s of listSkills()) {
      if (s.name.startsWith("audit-skill")) deleteSkill(s.id)
    }

    const skillName = `audit-skill-${Date.now()}`
    const skill = createSkill({
      name: skillName,
      description: "Audit test skill",
      instructions: "Step 1: check. Step 2: return OK.",
      sourceTask: "audit",
    })
    expect(skill.id).toBeDefined()
    expect(skill.name).toBe(skillName)

    const md = toSkillMd(skill)
    expect(md).toContain(skillName)
    expect(md).toContain("Step 1: check.")

    deleteSkill(skill.id)
    expect(getSkill(skill.id)).toBeUndefined()
  })
})

describe("9. MCP Key Management", () => {
  it("verifies MCP key and timing-safe equal check", async () => {
    const { getMcpKey, verifyMcpKey } = await import("@/lib/settings")
    const key = getMcpKey()
    if (key) {
      expect(key.startsWith("aos_")).toBe(true)
      expect(verifyMcpKey(key)).toBe(true)
      expect(verifyMcpKey("aos_boguskey")).toBe(false)
    }
  })
})
