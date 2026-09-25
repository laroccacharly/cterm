import { useCallback, useState } from "react"

import { terminalSessionCount } from "../../../terminal/sessions.ts"
import type { TerminalController } from "./use-terminal.ts"
import { useTerminal } from "./use-terminal.ts"

export interface TerminalSessions {
  readonly active: TerminalController
  readonly activeSession: number
  readonly selectSession: (session: number) => void
  readonly sessions: readonly TerminalController[]
}

/**
 * Own every cterm terminal at once so switching between them is instant and
 * each session keeps its scrollback and shell state while hidden.
 */
export const useTerminalSessions = (active: boolean): TerminalSessions => {
  const [activeSession, setActiveSession] = useState(1)
  const first = useTerminal(1, active && activeSession === 1)
  const second = useTerminal(2, active && activeSession === 2)
  const third = useTerminal(3, active && activeSession === 3)
  const sessions = [first, second, third] as const
  const current = sessions[activeSession - 1] ?? first

  const selectSession = useCallback((session: number) => {
    if (session >= 1 && session <= terminalSessionCount) {
      setActiveSession(session)
    }
  }, [])

  return { active: current, activeSession, selectSession, sessions }
}
