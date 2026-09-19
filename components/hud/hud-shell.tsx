'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatCircle, CaretLeft } from '@phosphor-icons/react'
import { StatusBar } from '@/components/status-bar'
import { ChatPanel } from '@/components/chat-panel'
import { FeedPanel } from '@/components/feed-panel'
import { MemoryPanel } from '@/components/memory-panel'
import { NotesPanel } from '@/components/notes-panel'
import { SkillsPanel } from '@/components/skills-panel'
import { SettingsPanel } from '@/components/settings-panel'
import { TasksPanel } from '@/components/tasks-panel'
import { EdgeRail, RAIL_ITEMS, type RightTab } from '@/components/hud/edge-rail'
import { PanelOverlay } from '@/components/hud/panel-overlay'
import { CoreReadout } from '@/components/hud/core-readout'
import { NotificationToasts } from '@/components/hud/notification-toasts'
import { WakeWordListener } from '@/components/voice/wake-word-listener'
import { useThemeStore } from '@/lib/theme-engine'

const PANEL_LABEL: Record<RightTab, string> = {
  feed: 'feed',
  notes: 'notes',
  memory: 'memory',
  skills: 'skills',
  tasks: 'tasks',
  settings: 'settings',
}

function renderPanel(tab: RightTab) {
  switch (tab) {
    case 'feed':
      return <FeedPanel />
    case 'notes':
      return <NotesPanel />
    case 'memory':
      return <MemoryPanel />
    case 'skills':
      return <SkillsPanel />
    case 'tasks':
      return <TasksPanel />
    case 'settings':
      return <SettingsPanel />
  }
}

/**
 * Layout orchestrator — Phase 3 §1.2/§1.3/§6. Owns the chat-dock collapse
 * state, the single summoned overlay panel, and the global hotkeys
 * (Ctrl+B, Alt+1..5). Renders the open desktop composition at >=1024px and
 * the single-column + bottom-tab-bar composition below it (`isDesktop` is
 * decided once, in `app/page.tsx`, and shared with the stage-mount decision
 * there so both switch at the exact same breakpoint).
 */
export function HudShell({ isDesktop }: { isDesktop: boolean }) {
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [openPanel, setOpenPanel] = useState<RightTab | null>(null)
  const lastOpenPanelRef = useRef<RightTab | null>(null)
  const railButtonRefs = useRef<Partial<Record<RightTab, HTMLButtonElement | null>>>({})
  const railContainerRef = useRef<HTMLDivElement>(null)

  const togglePanel = useCallback((tab: RightTab) => {
    setOpenPanel((prev) => (prev === tab ? null : tab))
  }, [])

  const closePanel = useCallback(() => setOpenPanel(null), [])

  const registerButtonRef = useCallback((tab: RightTab, el: HTMLButtonElement | null) => {
    railButtonRefs.current[tab] = el
  }, [])

  // Focus moves into the panel on open (handled by PanelOverlay); returns to
  // the rail on close (handled here, since only HudShell knows which rail
  // button corresponds to the panel that just closed).
  useEffect(() => {
    if (openPanel) {
      lastOpenPanelRef.current = openPanel
    } else if (lastOpenPanelRef.current) {
      railButtonRefs.current[lastOpenPanelRef.current]?.focus()
    }
  }, [openPanel])

  // Bridge HUD layout into the theme store so the scene's CameraRig can
  // re-center the reactor into the free space the HUD leaves (§1.2). Written
  // via the store action; the scene reads it per-frame with getState(), and
  // no store subscriber selects these fields, so this triggers no re-renders.
  useEffect(() => {
    useThemeStore.getState().setHudLayout({ chatOpen: !chatCollapsed })
  }, [chatCollapsed])

  useEffect(() => {
    useThemeStore.getState().setHudLayout({ overlayOpen: openPanel !== null })
  }, [openPanel])

  // Global hotkeys: Ctrl+B collapses/expands the chat dock, Alt+1..5 summons
  // the corresponding panel (or closes it if already open), Right Alt alone
  // talks to Jarvis. Esc is handled by PanelOverlay itself while a panel is
  // open.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setChatCollapsed((v) => !v)
        return
      }
      // Right Alt alone OR Alt+J — talk to Jarvis: dispatches jarvis:toggle-mic
      if (
        (event.code === 'AltRight' && event.key === 'Alt') ||
        (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'j')
      ) {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('jarvis:toggle-mic'))
        return
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const index = Number(event.key)
        if (index >= 1 && index <= RAIL_ITEMS.length) {
          event.preventDefault()
          togglePanel(RAIL_ITEMS[index - 1].tab)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePanel])

  if (!isDesktop) {
    return (
      <>
        <WakeWordListener />
        <NotificationToasts />
        <div className="pointer-events-none fixed inset-0 z-30 flex flex-col">
          <div className="hud-scrim-top pointer-events-none absolute inset-x-0 top-0 z-10 h-24" />
          <div className="pointer-events-auto relative z-20 pt-[env(safe-area-inset-top)]">
            <StatusBar onOpenSettings={() => togglePanel('settings')} />
          </div>
          <div className="pointer-events-auto relative z-20 min-h-0 flex-1 pb-16">
            <ChatPanel
              onStateChange={(state) => useThemeStore.getState().setCoreState(state)}
            />
          </div>
          <EdgeRail
            orientation="horizontal"
            activeTab={openPanel}
            onSelect={togglePanel}
            registerButtonRef={registerButtonRef}
            containerRef={railContainerRef}
          />
          {openPanel && (
            <PanelOverlay
              title={PANEL_LABEL[openPanel]}
              onClose={closePanel}
              excludeRef={railContainerRef}
              variant="fullscreen"
            >
              {renderPanel(openPanel)}
            </PanelOverlay>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      <WakeWordListener />
      {/* z-50 top-right — Phase 6's `notification-toasts.tsx` (reminder/event
          toasts, per MASTER_PLAN_V2.md §3 4B and §5.2), sitting above the
          status bar (z-20) and the panel overlay (z-40). */}
      <NotificationToasts />
      <div className="hud-scrim-top pointer-events-none absolute inset-x-0 top-0 z-10 h-24" />
      <div className="pointer-events-auto absolute inset-x-0 top-0 z-20">
        <StatusBar onOpenSettings={() => togglePanel('settings')} />
      </div>

      {/*
        Chat dock — left, collapsible. Animates `width` (a layout property) —
        a deliberate, scoped exception, not an oversight: the collapse must
        genuinely reflow its content (title hides, body swaps for a centered
        glyph, the dock becomes a 48px click target), which a transform-only
        slide can't do without an extra clip/mask layer. It's a single
        `position: absolute` element with `contain: layout` (below), so the
        reflow cannot cascade to siblings — the rail, panel overlay, and
        core-readout are independently positioned and never re-measure. It's
        also a one-off, infrequent, user-triggered 250ms transition, not a
        continuous/per-frame animation, so the residual cost is negligible.
      */}
      <div
        className="hud-glass hud-glass-accent-edge hud-edge-fade pointer-events-auto absolute left-3 top-24 z-20 flex flex-col overflow-hidden rounded-[var(--radius-xl)]"
        style={{
          width: chatCollapsed ? '48px' : '400px',
          bottom: '12px',
          contain: 'layout',
          transition: 'width var(--duration-base) var(--ease-out-expo)',
        }}
      >
        <div className="flex items-center justify-between px-3 py-2">
          {!chatCollapsed && (
            <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/80">
              agent <span className="text-muted-foreground">{'// chat'}</span>
            </h2>
          )}
          <button
            type="button"
            onClick={() => setChatCollapsed((v) => !v)}
            aria-label={chatCollapsed ? 'Expand chat' : 'Collapse chat'}
            aria-expanded={!chatCollapsed}
            title="Ctrl+B"
            className="ml-auto rounded-sm p-1 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CaretLeft
              className="size-4"
              style={{
                transition: 'transform var(--duration-base) var(--ease-out-expo)',
                transform: chatCollapsed ? 'rotate(180deg)' : 'none',
              }}
              aria-hidden="true"
            />
          </button>
        </div>
        <div className={chatCollapsed ? 'hidden' : 'min-h-0 flex-1'}>
          <ChatPanel
            onStateChange={(state) => useThemeStore.getState().setCoreState(state)}
          />
        </div>
        {chatCollapsed && (
          <div className="flex flex-1 items-center justify-center">
            <ChatCircle className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Edge rail — right. */}
      <EdgeRail
        orientation="vertical"
        activeTab={openPanel}
        onSelect={togglePanel}
        registerButtonRef={registerButtonRef}
        containerRef={railContainerRef}
      />

      {openPanel && (
        <PanelOverlay
          title={PANEL_LABEL[openPanel]}
          onClose={closePanel}
          excludeRef={railContainerRef}
          variant="floating"
        >
          {renderPanel(openPanel)}
        </PanelOverlay>
      )}

      <CoreReadout />
    </div>
  )
}
