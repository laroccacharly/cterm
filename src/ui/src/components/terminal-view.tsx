import type { TerminalController } from "../hooks/use-terminal.ts"

interface TerminalViewProps {
  readonly activeSession: number
  readonly sessions: readonly TerminalController[]
}

export const TerminalView = ({
  activeSession,
  sessions,
}: TerminalViewProps) => (
  <>
    {sessions.map((session, index) => {
      const sessionNumber = index + 1
      const active = sessionNumber === activeSession
      return (
        <section
          aria-label={`cterm terminal ${sessionNumber}`}
          className={`terminal-frame ${active ? "terminal-frame--active" : "terminal-frame--hidden"}`}
          data-session={sessionNumber}
          key={sessionNumber}
        >
          <div className="terminal" ref={session.containerRef} />
        </section>
      )
    })}
  </>
)
