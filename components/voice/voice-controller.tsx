'use client'

import { useEffect, useRef, useState } from 'react'
import { useThemeStore, type CoreState } from '@/lib/theme-engine'
import { WorkletRecorder } from '@/lib/voice/recorder'
import { EnergyVad } from '@/lib/voice/vad'
import { SentenceChunker } from '@/lib/voice/sentence-chunker'
import { TtsQueue } from '@/lib/voice/tts-queue'

/** Throttle for writing live mic level into the theme store. */
const MIC_LEVEL_WRITE_INTERVAL_MS = 75

/**
 * Per-stage latency marks for one voice turn (Phase 6 Chunk F). Populated as
 * the turn progresses; once every stage is known, sendLatencyReport() derives
 * the deltas and fires a non-blocking POST to /api/voice/latency. `turnAt` is
 * wall-clock (for the DB row); everything else uses performance.now() so
 * deltas are immune to clock adjustments.
 */
interface TurnLatencyMarks {
  turnAt: number
  turnStartPerf: number
  vadMs: number
  sttDonePerf: number | null
  brainFirstSentencePerf: number | null
  ttsFirstChunkPerf: number | null
}

/** Logs a clearly greppable line and fire-and-forget POSTs the completed turn. Never blocks or throws into the playback path. */
function sendLatencyReport(marks: TurnLatencyMarks) {
  if (
    marks.sttDonePerf === null ||
    marks.brainFirstSentencePerf === null ||
    marks.ttsFirstChunkPerf === null
  ) {
    return
  }
  const sttMs = marks.sttDonePerf - marks.turnStartPerf
  const brainFirstSentenceMs = marks.brainFirstSentencePerf - marks.sttDonePerf
  const ttsFirstChunkMs = marks.ttsFirstChunkPerf - marks.brainFirstSentencePerf
  const totalMs = marks.ttsFirstChunkPerf - marks.turnStartPerf

  console.log(
    `[voice-latency] vad=${marks.vadMs}ms stt=${Math.round(sttMs)}ms brain=${Math.round(brainFirstSentenceMs)}ms tts=${Math.round(ttsFirstChunkMs)}ms total=${Math.round(totalMs)}ms`,
  )

  const payload = {
    turnAt: marks.turnAt,
    vadMs: marks.vadMs,
    sttMs,
    brainFirstSentenceMs,
    ttsFirstChunkMs,
    totalMs,
  }
  fetch('/api/voice/latency', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Observability only — a failed write must never disrupt the voice pipeline.
  })
}

type VoiceControllerState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'

function toCoreState(state: VoiceControllerState): CoreState {
  if (state === 'listening') return 'listening'
  if (state === 'speaking') return 'speaking'
  if (state === 'transcribing' || state === 'thinking') return 'thinking'
  return 'idle'
}

export function VoiceController({
  onStateChange,
  onSendMessage,
  isAssistantStreaming,
  latestAssistantText,
  latestAssistantMessageId,
}: {
  onStateChange?: (state: CoreState) => void
  onSendMessage: (text: string) => void
  isAssistantStreaming: boolean
  latestAssistantText: string
  latestAssistantMessageId: string | null
}) {
  const [state, setState] = useState<VoiceControllerState>('idle')
  const [error, setError] = useState('')

  const recorderRef = useRef<WorkletRecorder | null>(null)
  const vadRef = useRef<EnergyVad | null>(null)
  const chunkerRef = useRef(new SentenceChunker())
  const ttsQueueRef = useRef<TtsQueue | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const lastMicWriteRef = useRef(0)
  const seenTextLengthRef = useRef(0)
  const wasStreamingRef = useRef(false)
  const turnMarksRef = useRef<TurnLatencyMarks | null>(null)
  // Live mirror of the latest assistant message id (read imperatively).
  const latestMessageIdRef = useRef(latestAssistantMessageId)
  latestMessageIdRef.current = latestAssistantMessageId
  // Id of the reply from a PREVIOUS, already-finished turn. It stays "latest"
  // in the message list during the gap before this turn's reply streams;
  // text carrying this id must never be (re)spoken.
  const previousMessageIdRef = useRef<string | null>(null)
  // Id of the message the chunker is currently consuming.
  const activeMessageIdRef = useRef<string | null>(null)

  // Report coreState transitions upward.
  useEffect(() => {
    onStateChange?.(toCoreState(state))
  }, [state, onStateChange])

  // Tell components/voice/wake-word-listener.tsx when a conversation turn is
  // active so it can release the mic (avoids two components fighting over
  // getUserMedia, and avoids "Jarvis" spoken mid-conversation double-triggering).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('jarvis:conversation-active', { detail: { active: state !== 'idle' } }),
    )
  }, [state])

  function writeMicLevel(level: number) {
    const now = performance.now()
    if (now - lastMicWriteRef.current < MIC_LEVEL_WRITE_INTERVAL_MS) return
    lastMicWriteRef.current = now
    useThemeStore.setState({ micLevel: level })
  }

  async function ensureTtsQueue(): Promise<TtsQueue> {
    if (!ttsQueueRef.current) {
      const queue = new TtsQueue()
      queue.onPlaybackStateChange = (playing) => {
        if (playing) {
          const marks = turnMarksRef.current
          if (marks && marks.ttsFirstChunkPerf === null) {
            marks.ttsFirstChunkPerf = performance.now()
            sendLatencyReport(marks)
          }
        }
        if (!playing && stateRef.current === 'speaking') {
          // Jarvis finished speaking. Voice is strictly turn-based now: one
          // press of the hotkey -> one utterance -> one reply -> mic closes.
          // Auto-reopening the mic here previously caused Jarvis's own
          // speech (and room noise) to be re-transcribed and dumped back
          // into the chat as new user messages.
          void stopEverything()
        }
      }
      ttsQueueRef.current = queue
    }
    return ttsQueueRef.current
  }

  async function ensureRecorder(): Promise<WorkletRecorder> {
    if (recorderRef.current) return recorderRef.current
    const recorder = new WorkletRecorder()
    const vad = new EnergyVad()
    vad.onSpeechStart = () => {
      recorder.markSpeechStart()
      if (stateRef.current === 'speaking') {
        // Barge-in: user started talking while Jarvis was speaking.
        ttsQueueRef.current?.stop()
        setState('listening')
      }
    }
    vad.onSpeechEnd = () => {
      if (stateRef.current !== 'listening') return
      void finishListeningTurn(recorder)
    }
    recorder.onSample = (rms, nowMs) => {
      vad.push(rms, nowMs)
      if (stateRef.current === 'listening') {
        writeMicLevel(recorder.level)
      }
    }

    await recorder.start()
    recorderRef.current = recorder
    vadRef.current = vad
    return recorder
  }

  async function finishListeningTurn(recorder: WorkletRecorder) {
    setState('transcribing')
    useThemeStore.setState({ micLevel: 0 })
    // Speech-end detected — start of the turn's latency clock.
    const turnStartPerf = performance.now()
    turnMarksRef.current = {
      turnAt: Date.now(),
      turnStartPerf,
      vadMs: vadRef.current?.hangoverMs ?? 0,
      sttDonePerf: null,
      brainFirstSentencePerf: null,
      ttsFirstChunkPerf: null,
    }
    try {
      const wav = recorder.finishUtterance()
      const res = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: wav,
      })
      const json = (await res.json()) as { text?: string; error?: string }
      if (!res.ok || !json.text) {
        throw new Error(json.error ?? 'nothing transcribed')
      }
      if (turnMarksRef.current) turnMarksRef.current.sttDonePerf = performance.now()
      chunkerRef.current.reset()
      seenTextLengthRef.current = 0
      wasStreamingRef.current = false
      // Mark whatever reply is currently "latest" as belonging to the turn that
      // just ended, so the chunking effect ignores it until THIS turn's reply
      // (a new message id) begins streaming.
      previousMessageIdRef.current = latestMessageIdRef.current
      activeMessageIdRef.current = latestMessageIdRef.current
      setState('thinking')
      onSendMessage(json.text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'transcription failed')
      // Nothing usable was said — no completed turn to report.
      turnMarksRef.current = null
      // Nothing usable was said — end the turn rather than looping the mic.
      await stopEverything()
    }
  }

  async function stopEverything() {
    ttsQueueRef.current?.stop()
    useThemeStore.setState({ micLevel: 0 })
    const recorder = recorderRef.current
    recorderRef.current = null
    vadRef.current = null
    if (recorder) {
      await recorder.stop().catch(() => undefined)
    }
    setState('idle')
  }

  async function toggle() {
    setError('')
    if (state === 'idle') {
      try {
        await ensureRecorder()
        await ensureTtsQueue()
        setState('listening')
      } catch (err) {
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'microphone access denied'
            : err instanceof Error
              ? err.message
              : 'microphone access denied',
        )
        await stopEverything()
      }
      return
    }
    // Any other state: user wants to stop the conversation entirely.
    await stopEverything()
  }

  const toggleRef = useRef(toggle)
  toggleRef.current = toggle
  useEffect(() => {
    function handleToggleMic() {
      void toggleRef.current()
    }
    window.addEventListener('jarvis:toggle-mic', handleToggleMic)
    return () => window.removeEventListener('jarvis:toggle-mic', handleToggleMic)
  }, [])

  // Sentence-stream TTS: chunk the delta of the accumulating assistant reply
  // and enqueue completed sentences as they appear.
  useEffect(() => {
    if (stateRef.current !== 'thinking' && stateRef.current !== 'speaking') return

    // Ignore the previous turn's reply, which remains the "latest" assistant
    // message until this turn's reply starts streaming. Speaking it here is the
    // root cause of the "voice replies one turn behind" bug.
    if (
      latestAssistantMessageId !== null &&
      latestAssistantMessageId === previousMessageIdRef.current
    ) {
      return
    }

    // A genuinely new assistant message became the latest: chunk it from its
    // start, not from the previous message's text offset.
    if (latestAssistantMessageId !== activeMessageIdRef.current) {
      activeMessageIdRef.current = latestAssistantMessageId
      chunkerRef.current.reset()
      seenTextLengthRef.current = 0
    }

    const total = latestAssistantText.length
    const prevLength = seenTextLengthRef.current
    if (total > prevLength) {
      const delta = latestAssistantText.slice(prevLength)
      seenTextLengthRef.current = total
      const chunks = chunkerRef.current.push(delta)
      if (chunks.length > 0) {
        const marks = turnMarksRef.current
        if (marks && marks.brainFirstSentencePerf === null) {
          marks.brainFirstSentencePerf = performance.now()
        }
        if (stateRef.current === 'thinking') setState('speaking')
        void ensureTtsQueue().then((queue) => {
          for (const chunk of chunks) queue.enqueue(chunk)
        })
      }
    }

    if (!isAssistantStreaming && wasStreamingRef.current) {
      const final = chunkerRef.current.finalize()
      if (final) {
        const marks = turnMarksRef.current
        if (marks && marks.brainFirstSentencePerf === null) {
          marks.brainFirstSentencePerf = performance.now()
        }
        if (stateRef.current === 'thinking') setState('speaking')
        void ensureTtsQueue().then((queue) => queue.enqueue(final))
      } else if (stateRef.current === 'thinking') {
        // No speakable content came back at all — end the turn rather than
        // hanging in 'thinking' or reopening the mic.
        void stopEverything()
      }
    }
    wasStreamingRef.current = isAssistantStreaming
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestAssistantText, latestAssistantMessageId, isAssistantStreaming])

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      ttsQueueRef.current?.stop()
      recorderRef.current?.stop().catch(() => undefined)
    }
  }, [])

  const label =
    state === 'listening'
      ? 'Stop listening'
      : state === 'speaking'
        ? 'Interrupt and stop'
        : state === 'transcribing' || state === 'thinking'
          ? 'Working…'
          : 'Start voice input'

  const displayText =
    state === 'listening'
      ? 'listen'
      : state === 'transcribing'
        ? '…'
        : state === 'thinking'
          ? '…'
          : state === 'speaking'
            ? 'mute'
            : 'mic'

  return (
    <>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={state === 'transcribing'}
        aria-label={label}
        className={`rounded-sm border px-3 py-1 font-mono text-xs uppercase tracking-widest transition-colors disabled:opacity-40 ${
          state === 'listening'
            ? 'animate-pulse border-primary/60 bg-primary/15 text-primary'
            : state === 'speaking'
              ? 'border-accent/60 bg-accent/15 text-accent'
              : 'border-[oklch(from_var(--accent-live)_l_c_h_/_30%)] text-primary hover:border-[oklch(from_var(--accent-live)_l_c_h_/_55%)]'
        }`}
      >
        {displayText}
      </button>
      {error && (
        <p className="absolute -bottom-6 right-3 whitespace-nowrap font-mono text-[10px] text-destructive">
          {'[voice] '}
          {error}
        </p>
      )}
    </>
  )
}
