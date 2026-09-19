import path from "node:path"

/**
 * Local voice binary/script locations. scripts/setup-voice.ps1 downloads the
 * whisper-cli + Piper binaries into ./bin, the models into ./models, and
 * provisions the STT sidecar's Python venv under tools/stt-server/.venv.
 * Override any of these with an env var of the same name if you keep things
 * elsewhere.
 */

const IS_WIN = process.platform === "win32"
const EXE = IS_WIN ? ".exe" : ""

const BIN_DIR = path.join(process.cwd(), "bin")
const MODELS_DIR = path.join(process.cwd(), "models")
const STT_SERVER_DIR = path.join(process.cwd(), "tools", "stt-server")

export const WHISPER_BIN =
  process.env.WHISPER_BIN ?? path.join(BIN_DIR, `whisper-cli${EXE}`)

export const WHISPER_MODEL =
  process.env.WHISPER_MODEL ?? path.join(MODELS_DIR, "ggml-tiny.en.bin")

// The pinned Piper release zip extracts into a piper/ subdirectory.
export const PIPER_BIN =
  process.env.PIPER_BIN ?? path.join(BIN_DIR, "piper", `piper${EXE}`)

export const PIPER_VOICE =
  process.env.PIPER_VOICE ?? path.join(MODELS_DIR, "en_US-lessac-medium.onnx")

/** faster-whisper sidecar (tools/stt-server/server.py), 127.0.0.1 only. */
export const STT_SIDECAR_URL =
  process.env.STT_SIDECAR_URL ?? "http://127.0.0.1:8976"

export const STT_PYTHON =
  process.env.STT_PYTHON ??
  (IS_WIN
    ? path.join(STT_SERVER_DIR, ".venv", "Scripts", "python.exe")
    : path.join(STT_SERVER_DIR, ".venv", "bin", "python"))

export const STT_SERVER_SCRIPT =
  process.env.STT_SERVER_SCRIPT ?? path.join(STT_SERVER_DIR, "server.py")
