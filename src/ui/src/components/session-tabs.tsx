import { useEffect, useState } from "react"

import type { TerminalController } from "../hooks/use-terminal.ts"

interface SessionTabsProps {
  readonly activeSession: number
  readonly onSelect: (session: number) => void
  readonly sessions: readonly TerminalController[]
}

const confirmWindowMs = 3000

const preventFocusSteal = (event: { preventDefault: () => void }) => {
  event.preventDefault()
}

interface ResetButtonProps {
  readonly session: number
  readonly terminal: TerminalController | undefined
}

/** Kill the session's shell after a second confirming tap. */
const ResetButton = ({ session, terminal }: ResetButtonProps) => {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    const timer = armed
      ? setTimeout(() => {
          setArmed(false)
        }, confirmWindowMs)
      : undefined
    return () => {
      clearTimeout(timer)
    }
  }, [armed])

  useEffect(() => {
    setArmed(false)
  }, [session])

  return (
    <button
      aria-label={`Reset terminal session ${session}`}
      className={`session-tab session-tab--reset ${armed ? "session-tab--armed" : ""}`}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          return
        }
        setArmed(false)
        terminal?.reset()
      }}
      onMouseDown={preventFocusSteal}
      title={`Reset session ${session} (fresh shell, reloads .bashrc)`}
      type="button"
    >
      <span className="session-tab__number">{armed ? "Confirm?" : "Reset"}</span>
    </button>
  )
}

/** A row of buttons that switch between the always-open terminal sessions. */
export const SessionTabs = ({
  activeSession,
  onSelect,
  sessions,
}: SessionTabsProps) => (
  <nav aria-label="Terminal sessions" className="session-tabs">
    {sessions.map((session, index) => {
      const sessionNumber = index + 1
      const active = sessionNumber === activeSession
      return (
        <button
          aria-label={`Terminal session ${sessionNumber}`}
          aria-pressed={active}
          className={`session-tab ${active ? "session-tab--active" : ""}`}
          key={sessionNumber}
          onClick={() => {
            onSelect(sessionNumber)
          }}
          onMouseDown={preventFocusSteal}
          title={`Terminal session ${sessionNumber} (${session.status})`}
          type="button"
        >
          <span className="session-tab__number">{sessionNumber}</span>
          <span
            aria-hidden="true"
            className={`session-tab__status session-tab__status--${session.status}`}
          />
        </button>
      )
    })}
    <ResetButton
      session={activeSession}
      terminal={sessions[activeSession - 1]}
    />
  </nav>
)
