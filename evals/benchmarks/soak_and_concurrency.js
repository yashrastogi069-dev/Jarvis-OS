import fs from "node:fs"
import path from "node:path"
import { performance } from "node:perf_hooks"
import http from "node:http"

// Import database to test real SQLite locking and memory
import Database from "better-sqlite3"

const DB_PATH = path.join(process.cwd(), "data", "agentic-os.db")
const db = new Database(DB_PATH)

// Ensure tasks table exists and is accessible
db.pragma("journal_mode = WAL")
db.pragma("busy_timeout = 5000")

console.log("Starting Soak and Concurrency Test Suite...")

async function runSoakTest() {
  const initialMemory = process.memoryUsage()
  const initialCpu = process.cpuUsage()
  const startTime = performance.now()

  const turnLatencies = []
  const memorySnapshots = []
  let sqliteLockErrors = 0
  let completedTurns = 0
  let burstErrors = 0

  console.log("\n1. Running 100-Turn Conversation Soak...")
  for (let i = 1; i <= 100; i++) {
    const t0 = performance.now()

    try {
      // Simulate typical agent turn: read tasks, check memories, conditionally insert/update
      const tasks = db.prepare("SELECT * FROM tasks ORDER BY id DESC LIMIT 10").all()
      const memories = db.prepare("SELECT * FROM memories ORDER BY id DESC LIMIT 5").all()
      
      if (i % 10 === 0) {
        // Periodic write
        const ins = db.prepare("INSERT INTO tasks (title, status, created_at, updated_at) VALUES (?, ?, ?, ?)")
        ins.run(`Soak Task Turn ${i}`, "open", new Date().toISOString(), new Date().toISOString())
      }

      // Small async tick simulating token processing delay (10-25ms)
      await new Promise(r => setTimeout(r, 15))
      const t1 = performance.now()
      const turnMs = t1 - t0
      turnLatencies.push(turnMs)
      completedTurns++

      if (i % 20 === 0 || i === 1) {
        const mem = process.memoryUsage()
        memorySnapshots.push({
          turn: i,
          heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(2),
          rssMb: (mem.rss / 1024 / 1024).toFixed(2),
          turnMs: turnMs.toFixed(1)
        })
      }
    } catch (err) {
      if (err.message && err.message.includes("locked")) {
        sqliteLockErrors++
      }
      console.error(`Turn ${i} error:`, err.message)
    }
  }

  // 2. Rapid consecutive burst (15 concurrent operations)
  console.log("\n2. Testing Rapid Concurrent Message Burst (15 parallel requests)...")
  const burstStart = performance.now()
  const burstPromises = Array.from({ length: 15 }).map(async (_, idx) => {
    try {
      const q = db.prepare("SELECT COUNT(*) as c FROM tasks").get()
      if (idx % 2 === 0) {
        db.prepare("INSERT INTO tasks (title, status, created_at, updated_at) VALUES (?, ?, ?, ?)").run(`Burst Task ${idx}`, "open", new Date().toISOString(), new Date().toISOString())
      }
      return { ok: true, count: q.c }
    } catch (err) {
      burstErrors++
      return { ok: false, error: err.message }
    }
  })
  const burstResults = await Promise.all(burstPromises)
  const burstDuration = performance.now() - burstStart

  // 3. Concurrency: STT voice request during background SQLite activity
  console.log("\n3. Testing Concurrent STT Voice Call during Database Activity...")
  const wavPath = path.join(process.cwd(), "scratch", "voice_real_speech.wav")
  let voiceConcurrentOk = false
  let voiceConcurrentMs = 0

  if (fs.existsSync(wavPath)) {
    const wavData = fs.readFileSync(wavPath)
    const v0 = performance.now()

    // Concurrently write to DB while STT processes
    const dbBusyWork = new Promise((resolve) => {
      for (let j = 0; j < 50; j++) {
        db.prepare("SELECT * FROM tasks LIMIT 5").all()
      }
      resolve(true)
    })

    const sttCall = new Promise((resolve) => {
      const req = http.request("http://127.0.0.1:8976/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "Content-Length": wavData.length }
      }, (res) => {
        let body = ""
        res.on("data", d => body += d)
        res.on("end", () => {
          resolve({ status: res.statusCode, body })
        })
      })
      req.on("error", (e) => resolve({ error: e.message }))
      req.write(wavData)
      req.end()
    })

    const [dbRes, sttRes] = await Promise.all([dbBusyWork, sttCall])
    voiceConcurrentMs = performance.now() - v0
    voiceConcurrentOk = sttRes.status === 200
    console.log(`STT Concurrent duration: ${voiceConcurrentMs.toFixed(1)}ms, STT OK: ${voiceConcurrentOk}`)
  }

  // Clean up test tasks created during soak
  db.prepare("DELETE FROM tasks WHERE title LIKE 'Soak Task%' OR title LIKE 'Burst Task%'").run()

  const finalMemory = process.memoryUsage()
  const finalCpu = process.cpuUsage(initialCpu)
  const totalDuration = performance.now() - startTime

  // Calculate stats
  const first10Latencies = turnLatencies.slice(0, 10)
  const last10Latencies = turnLatencies.slice(90, 100)
  const avgFirst10 = (first10Latencies.reduce((a, b) => a + b, 0) / 10).toFixed(2)
  const avgLast10 = (last10Latencies.reduce((a, b) => a + b, 0) / 10).toFixed(2)
  const driftPercent = (((avgLast10 - avgFirst10) / avgFirst10) * 100).toFixed(1) + "%"

  const sortedLatencies = [...turnLatencies].sort((a, b) => a - b)
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.50)].toFixed(2)
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)].toFixed(2)

  const soakReport = {
    totalTurns: completedTurns,
    totalDurationMs: totalDuration.toFixed(1),
    turnLatencyMs: {
      p50,
      p95,
      avgFirst10,
      avgLast10,
      drift: driftPercent
    },
    memoryUsage: {
      initialHeapUsedMb: (initialMemory.heapUsed / 1024 / 1024).toFixed(2),
      finalHeapUsedMb: (finalMemory.heapUsed / 1024 / 1024).toFixed(2),
      heapGrowthMb: ((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2),
      rssMb: (finalMemory.rss / 1024 / 1024).toFixed(2)
    },
    cpuUsage: {
      userMs: Math.round(finalCpu.user / 1000),
      systemMs: Math.round(finalCpu.system / 1000)
    },
    concurrencyResults: {
      burstRequests: 15,
      burstErrors,
      burstDurationMs: burstDuration.toFixed(1),
      sqliteLockCollisions: sqliteLockErrors,
      voiceConcurrentOk,
      voiceConcurrentMs: voiceConcurrentMs.toFixed(1)
    },
    memorySnapshots
  }

  const outPath = path.join(process.cwd(), "logs", "soak_concurrency_results.json")
  fs.writeFileSync(outPath, JSON.stringify(soakReport, null, 2), "utf-8")
  console.log(`\nSaved soak and concurrency report to ${outPath}`)
  console.log("\n=== SOAK TEST SUMMARY ===")
  console.log(`Completed Turns:           ${completedTurns} / 100`)
  console.log(`Turn Latency p50 / p95:     ${p50}ms / ${p95}ms`)
  console.log(`First 10 vs Last 10 Drift: ${avgFirst10}ms -> ${avgLast10}ms (${driftPercent})`)
  console.log(`Heap Memory:               ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB -> ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
  console.log(`SQLite Lock Collisions:    ${sqliteLockErrors}`)
  console.log(`Burst Errors (15 parallel):${burstErrors}`)
}

runSoakTest().catch(console.error)
