import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  STT_PYTHON,
  STT_SERVER_SCRIPT,
  STT_SIDECAR_URL,
  WHISPER_BIN,
  WHISPER_MODEL,
} from "./paths"

/**
 * Server-side STT chain: faster-whisper sidecar (managed, auto-started on
 * first miss) -> whisper-cli one-shot fallback -> honest failure. See
 * tasks/PHASE6_BENCH.md for the measured latency numbers behind these
 * timeouts.
 */

export class VoiceUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VoiceUnavailableError"
  }
}

export type TranscribeResult = {
  text: string
  engine: string
  decodeMs: number
  audioMs: number | null
  rtf: number | null
}

export type SttStatus = {
  ok: boolean
  engine: "sidecar" | "whisper-cli" | null
  sidecar: { up: boolean; loaded?: boolean; model?: string }
  fallbackAvailable: boolean
}

const SIDECAR_TIMEOUT_MS = 30_000
const HEALTH_CHECK_TIMEOUT_MS = 1_500
const AUTOSTART_COOLDOWN_MS = 30_000
const AUTOSTART_POLL_INTERVAL_MS = 500
const AUTOSTART_POLL_TIMEOUT_MS = 15_000

type GlobalWithSttStarter = typeof globalThis & {
  __jarvisSttStarting?: boolean
  __jarvisSttLastStartAttempt?: number
}

const g = globalThis as GlobalWithSttStarter

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isConnectionRefused(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const cause = (err as { cause?: { code?: string } }).cause
  const code = cause?.code ?? (err as { code?: string }).code
  return code === "ECONNREFUSED" || code === "ECONNRESET" || /ECONNREFUSED/.test(err.message)
}

async function postTranscribe(wav: Buffer): Promise<TranscribeResult> {
  const res = await fetch(`${STT_SIDECAR_URL}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(wav),
    signal: AbortSignal.timeout(SIDECAR_TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`STT sidecar returned ${res.status}: ${body.slice(0, 400) || res.statusText}`)
  }

  const data = (await res.json()) as {
    text?: string
    engine?: string
    decodeMs?: number
    audioMs?: number
    rtf?: number | null
  }

  return {
    text: data.text ?? "",
    engine: data.engine ?? "faster-whisper",
    decodeMs: data.decodeMs ?? 0,
    audioMs: data.audioMs ?? null,
    rtf: data.rtf ?? null,
  }
}

/**
 * Attempt to bring the sidecar up: spawn it detached (guarded so concurrent
 * requests don't spawn duplicates and so we don't hammer a slow cold start),
 * then poll /health until it answers or we give up.
 */
async function ensureSidecarStarted(): Promise<boolean> {
  const now = Date.now()
  const canAttemptSpawn =
    !g.__jarvisSttStarting &&
    (!g.__jarvisSttLastStartAttempt || now - g.__jarvisSttLastStartAttempt >= AUTOSTART_COOLDOWN_MS)

  if (canAttemptSpawn) {
    if (!existsSync(STT_PYTHON)) return false
    g.__jarvisSttStarting = true
    g.__jarvisSttLastStartAttempt = now
    let port = "8976"
    try {
      port = new URL(STT_SIDECAR_URL).port || "8976"
    } catch {}
    try {
      spawn(STT_PYTHON, [STT_SERVER_SCRIPT], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, STT_PORT: process.env.STT_PORT ?? port, STT_PRELOAD: "0" },
      }).unref()
    } catch {
      g.__jarvisSttStarting = false
      return false
    }
  } else if (!existsSync(STT_PYTHON)) {
    return false
  }

  const deadline = Date.now() + AUTOSTART_POLL_TIMEOUT_MS
  try {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${STT_SIDECAR_URL}/health`, {
          signal: AbortSignal.timeout(1_000),
        })
        if (res.ok) return true
      } catch {
        // not up yet — keep polling
      }
      await sleep(AUTOSTART_POLL_INTERVAL_MS)
    }
    return false
  } finally {
    if (canAttemptSpawn) g.__jarvisSttStarting = false
  }
}

async function transcribeWithWhisperCli(wav: Buffer): Promise<TranscribeResult> {
  const dir = await mkdtemp(path.join(tmpdir(), "jarvis-stt-"))
  const wavPath = path.join(dir, "input.wav")
  const outBase = path.join(dir, "out")
  const t0 = performance.now()

  try {
    await writeFile(wavPath, wav)

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(WHISPER_BIN, [
        "-m", WHISPER_MODEL,
        "-f", wavPath,
        "-otxt",
        "-of", outBase,
        "--no-prints",
        "-t", "2",
      ])
      let stderr = ""
      proc.stderr.on("data", (d) => (stderr += d))
      proc.on("error", reject)
      proc.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`whisper-cli exited ${code}: ${stderr.slice(-400)}`)),
      )
    })

    const text = (await readFile(`${outBase}.txt`, "utf8")).trim()
    return {
      text,
      engine: "whisper-cli",
      decodeMs: Math.round(performance.now() - t0),
      audioMs: null,
      rtf: null,
    }
  } finally {
    await Promise.allSettled([unlink(wavPath), unlink(`${outBase}.txt`)])
  }
}

/**
 * Transcribe a WAV buffer via the sidecar, auto-starting it if it isn't
 * running, then falling back to a one-shot whisper-cli spawn, then failing
 * honestly if nothing is installed.
 */
export async function transcribeWav(wav: Buffer): Promise<TranscribeResult> {
  let lastError: unknown = null

  try {
    return await postTranscribe(wav)
  } catch (err) {
    lastError = err
    if (isConnectionRefused(err)) {
      const started = await ensureSidecarStarted()
      if (started) {
        try {
          return await postTranscribe(wav)
        } catch (err2) {
          lastError = err2
        }
      }
    }
  }

  if (existsSync(WHISPER_BIN) && existsSync(WHISPER_MODEL)) {
    return transcribeWithWhisperCli(wav)
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  throw new VoiceUnavailableError(
    `STT is unavailable: the faster-whisper sidecar at ${STT_SIDECAR_URL} could not be reached ` +
      `(${reason}), and no whisper-cli fallback was found (looked for ${WHISPER_BIN} and ` +
      `${WHISPER_MODEL}). Run scripts/setup-voice.ps1 to install the sidecar's Python ` +
      `environment (tools/stt-server/.venv) or the whisper-cli fallback.`,
  )
}

/** Probe STT availability without throwing. Used by the status endpoint. */
export async function sttStatus(): Promise<SttStatus> {
  let sidecarUp = false
  let loaded: boolean | undefined
  let model: string | undefined

  try {
    const res = await fetch(`${STT_SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    })
    if (res.ok) {
      sidecarUp = true
      const data = (await res.json()) as { loaded?: boolean; model?: string }
      loaded = data.loaded
      model = data.model
    }
  } catch {
    sidecarUp = false
  }

  const fallbackAvailable = existsSync(WHISPER_BIN) && existsSync(WHISPER_MODEL)

  return {
    ok: sidecarUp || fallbackAvailable,
    engine: sidecarUp ? "sidecar" : fallbackAvailable ? "whisper-cli" : null,
    sidecar: { up: sidecarUp, loaded, model },
    fallbackAvailable,
  }
}
