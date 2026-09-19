'use client'

import { useRef, useState, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { CoreState } from '@/lib/theme-engine'
import { VoiceController } from '@/components/voice/voice-controller'

export function ChatPanel({
  onStateChange,
}: {
  onStateChange?: (state: CoreState) => void
}) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  const busy = status === 'submitted' || status === 'streaming'

  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant')
  const latestAssistantText = lastAssistantMessage
    ? lastAssistantMessage.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(' ')
    : ''
  // The voice controller needs the message *identity*, not just its text: until
  // a new turn's reply starts streaming, lastAssistantMessage is still the
  // PREVIOUS turn's reply, and without an id to distinguish them the previous
  // answer gets re-spoken on the next turn (the "voice is one reply behind" bug).
  const latestAssistantMessageId = lastAssistantMessage?.id ?? null

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  function submit() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    sendMessage({ text })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto p-3"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="p-2 font-mono text-xs leading-relaxed text-muted-foreground">
            {'> AGENT READY. Ask anything — I remember what matters.'}
            <br />
            {'> try: "remember that I prefer dark roast coffee"'}
            <br />
            {'> try: "what do you know about me?"'}
          </p>
        )}
        {messages
          // Voice-originated user turns are spoken, not typed — Yash doesn't
          // want his transcribed speech echoed into the chat. The turn still
          // goes to the brain and is persisted; only the bubble is hidden.
          .filter(
            (message) =>
              !(message.role === 'user' && (message.metadata as { voice?: boolean } | undefined)?.voice),
          )
          .map((message) => (
          <div
            key={message.id}
            className={`max-w-[92%] rounded-md px-3 py-2 text-sm leading-relaxed ${
              message.role === 'user'
                ? 'ml-auto bg-[oklch(from_var(--accent-live)_l_c_h_/_10%)] text-foreground shadow-[inset_0_0_0_1px_oklch(from_var(--accent-live)_l_c_h_/_20%)]'
                : 'text-foreground'
            }`}
          >
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {message.role === 'user' ? 'you' : 'agent'}
            </p>
            {message.parts.map((part, i) => {
              if (part.type === 'text') {
                return (
                  <p key={i} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                )
              }
              if (part.type.startsWith('tool-')) {
                return (
                  <p
                    key={i}
                    className="my-1 font-mono text-[10px] text-primary/80"
                  >
                    {'[tool] '}
                    {part.type.replace('tool-', '')}
                  </p>
                )
              }
              return null
            })}
          </div>
        ))}
        {busy && (
          <p className="animate-pulse px-2 font-mono text-xs text-primary">
            processing…
          </p>
        )}
        {error && (
          <p className="px-2 font-mono text-xs text-destructive">
            {'[error] '}
            {error.message}
          </p>
        )}
      </div>

      <div
        className="mx-3 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, oklch(1 0 0 / 10%), transparent)',
        }}
        aria-hidden="true"
      />
      <div className="flex gap-2 px-3 pt-2">
        {['brief me', "what's new on github?", 'what do you know about me?'].map(
          (quick) => (
            <button
              key={quick}
              type="button"
              disabled={busy}
              onClick={() => sendMessage({ text: quick })}
              className="rounded-sm border border-[oklch(from_var(--accent-live)_l_c_h_/_22%)] px-2 py-1 font-mono text-[10px] text-primary/85 transition-colors hover:bg-[oklch(from_var(--accent-live)_l_c_h_/_10%)] hover:text-primary disabled:opacity-40"
            >
              {quick}
            </button>
          ),
        )}
      </div>

      <form
        className="relative flex items-center gap-2 rounded-lg bg-[oklch(0.1_0.02_250_/_55%)] p-3 shadow-[inset_0_0_0_1px_oklch(1_0_0_/_7%)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_oklch(from_var(--accent-live)_l_c_h_/_45%),0_0_16px_oklch(from_var(--accent-live)_l_c_h_/_12%)] m-3 mt-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <span className="font-mono text-primary" aria-hidden="true">
          {'>'}
        </span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !(e.nativeEvent.isComposing || e.keyCode === 229)
            ) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="command the OS…"
          aria-label="Message the agent"
          className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <VoiceController
          onStateChange={onStateChange}
          onSendMessage={(text) => sendMessage({ text, metadata: { voice: true } })}
          isAssistantStreaming={busy}
          latestAssistantText={latestAssistantText}
          latestAssistantMessageId={latestAssistantMessageId}
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="rounded-sm bg-[oklch(from_var(--accent-live)_l_c_h_/_90%)] px-3 py-1 font-mono text-xs uppercase tracking-widest text-primary-foreground transition-all duration-[var(--duration-fast)] hover:bg-[var(--accent-live)] active:scale-[0.97] disabled:opacity-40"
        >
          send
        </button>
      </form>
    </div>
  )
}
