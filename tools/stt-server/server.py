"""Jarvis STT sidecar — faster-whisper behind a tiny local HTTP server.

One resident Whisper model serves every local caller (the Jarvis voice route
today, the dictation companion in Phase 7) so an 8 GB machine never holds two
copies of the same 500 MB model. Binds 127.0.0.1 only; no auth by design —
loopback is the trust boundary, same as the dev server itself.

Endpoints:
  GET  /health      -> {"ok": true, "loaded": bool, "model": "...", ...}
  POST /transcribe  -> body: WAV bytes (any rate/channels PyAV can read;
                       the client sends 16 kHz mono PCM). Response:
                       {"text": "...", "audioMs": int, "decodeMs": int,
                        "rtf": float, "engine": "faster-whisper"}
  POST /unload      -> drop the model now (tests / RAM pressure). 204.

Config (env, all optional):
  STT_PORT=8765  STT_MODEL=base  STT_COMPUTE=int8  STT_THREADS=4
  STT_BEAM=1  STT_LANGUAGE=en  STT_IDLE_UNLOAD_S=600  STT_PRELOAD=0

The model idle-unloads after STT_IDLE_UNLOAD_S seconds without a request and
transparently reloads on the next one (reload of cached base int8 measured
~2-3 s on the target i3).
"""

from __future__ import annotations

import gc
import io
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("STT_PORT", "8976"))
MODEL_NAME = os.environ.get("STT_MODEL", "base")
COMPUTE_TYPE = os.environ.get("STT_COMPUTE", "int8")
CPU_THREADS = int(os.environ.get("STT_THREADS", "4"))
BEAM_SIZE = int(os.environ.get("STT_BEAM", "1"))
LANGUAGE = os.environ.get("STT_LANGUAGE", "en")
IDLE_UNLOAD_S = int(os.environ.get("STT_IDLE_UNLOAD_S", "600"))
PRELOAD = os.environ.get("STT_PRELOAD", "0") == "1"

MAX_BODY_BYTES = 32 * 1024 * 1024  # ~17 min of 16 kHz mono PCM; far past any utterance

_started_at = time.time()


class ModelHost:
    """Owns the WhisperModel: lazy load, serialized inference, idle unload."""

    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        self._last_used = 0.0
        self._load_s: float | None = None

    def _ensure(self):
        if self._model is None:
            from faster_whisper import WhisperModel  # heavy import, keep lazy

            t0 = time.perf_counter()
            self._model = WhisperModel(
                MODEL_NAME,
                device="cpu",
                compute_type=COMPUTE_TYPE,
                cpu_threads=CPU_THREADS,
            )
            self._load_s = time.perf_counter() - t0
        return self._model

    def transcribe(self, wav_bytes: bytes) -> dict:
        # One model, CPU-bound decode: serialize callers instead of thrashing.
        with self._lock:
            model = self._ensure()
            t0 = time.perf_counter()
            segments, info = model.transcribe(
                io.BytesIO(wav_bytes),
                language=LANGUAGE,
                beam_size=BEAM_SIZE,
                vad_filter=True,
                condition_on_previous_text=False,
            )
            text = " ".join(s.text.strip() for s in segments).strip()
            decode_s = time.perf_counter() - t0
            self._last_used = time.time()
        audio_s = float(info.duration or 0.0)
        return {
            "text": text,
            "audioMs": int(audio_s * 1000),
            "decodeMs": int(decode_s * 1000),
            "rtf": round(decode_s / audio_s, 3) if audio_s > 0 else None,
            "engine": "faster-whisper",
            "model": MODEL_NAME,
        }

    def unload(self) -> bool:
        with self._lock:
            had = self._model is not None
            self._model = None
        if had:
            gc.collect()
        return had

    def status(self) -> dict:
        return {
            "ok": True,
            "loaded": self._model is not None,
            "model": MODEL_NAME,
            "computeType": COMPUTE_TYPE,
            "loadSeconds": round(self._load_s, 2) if self._load_s else None,
            "idleUnloadS": IDLE_UNLOAD_S,
            "uptimeS": int(time.time() - _started_at),
        }

    def idle_sweep(self) -> None:
        while True:
            time.sleep(60)
            if self._model is not None and self._last_used and time.time() - self._last_used > IDLE_UNLOAD_S:
                if self.unload():
                    print(f"[stt-server] model unloaded after {IDLE_UNLOAD_S}s idle", flush=True)


HOST = ModelHost()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (http.server API)
        if self.path == "/health":
            self._json(200, HOST.status())
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/unload":
            HOST.unload()
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path != "/transcribe":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 44:
            self._json(400, {"error": "empty audio"})
            return
        if length > MAX_BODY_BYTES:
            self._json(413, {"error": "audio too large"})
            return
        wav = self.rfile.read(length)
        try:
            self._json(200, HOST.transcribe(wav))
        except Exception as err:  # surface the real message; the caller falls back honestly
            self._json(500, {"error": f"{type(err).__name__}: {err}"})

    def log_message(self, fmt: str, *args) -> None:
        # Quiet by default; transcribe results are the interesting signal.
        pass


def main() -> None:
    if PRELOAD:
        HOST.transcribe(_silence_wav())
        print("[stt-server] model preloaded", flush=True)
    threading.Thread(target=HOST.idle_sweep, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[stt-server] listening on 127.0.0.1:{PORT} model={MODEL_NAME} {COMPUTE_TYPE}", flush=True)
    server.serve_forever()


def _silence_wav() -> bytes:
    """1 s of 16 kHz mono silence — enough to force a full model load."""
    import struct

    rate, n = 16000, 16000
    header = (
        b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVE"
        b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
        + b"data" + struct.pack("<I", n * 2)
    )
    return header + b"\x00" * (n * 2)


if __name__ == "__main__":
    main()
