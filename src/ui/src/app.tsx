import { useAtomSet } from "@effect/atom-react"
import { lazy, Suspense, useState } from "react"

import { transcribeAtom, voiceCommandAtom } from "./atoms.ts"
import { CommandsView } from "./commands/commands-view.tsx"
import { runCommand } from "./commands/commands.ts"
import { AppHeader } from "./components/app-header.tsx"
import { NoticeDialog } from "./components/notice-dialog.tsx"
import { SessionTabs } from "./components/session-tabs.tsx"
import { TerminalView } from "./components/terminal-view.tsx"
import { useToaster } from "./components/toaster.tsx"
import type { View } from "./components/view-switcher.tsx"
import { useRecorder } from "./hooks/use-recorder.ts"
import { useTerminalSessions } from "./hooks/use-terminal-sessions.ts"
import { Shortcuts } from "./shortcuts/shortcuts.tsx"

const DiffView = lazy(async () => {
  const module = await import("./components/diff-view.tsx")
  return { default: module.DiffView }
})

export const App = () => {
  const [view, setView] = useState<View>("terminal")
  const [notice, setNotice] = useState<string | null>(null)
  const [diffControlsContainer, setDiffControlsContainer] =
    useState<HTMLDivElement | null>(null)
  const sessions = useTerminalSessions(view === "terminal")
  const terminal = sessions.active
  const transcribe = useAtomSet(transcribeAtom, { mode: "promise" })
  const runVoiceCommand = useAtomSet(voiceCommandAtom, { mode: "promise" })
  const toaster = useToaster()
  const recorder = useRecorder({
    onError: toaster.error,
    onTranscript: terminal.sendInput,
    transcribe,
  })
  const voiceCommandRecorder = useRecorder({
    onError: toaster.error,
    onTranscript: async (transcript) => {
      const command = await runVoiceCommand(transcript)
      if (command === null) {
        setNotice("No commands found")
        return
      }
      runCommand(command, {
        changeFontSize: terminal.changeFontSize,
        sendInput: terminal.sendInput,
      })
    },
    transcribe,
  })

  let controls = null
  if (view === "terminal") {
    controls = (
      <Shortcuts
        voiceCommandRecorder={voiceCommandRecorder}
        isTouchDevice={terminal.isTouchDevice}
        keyboardActive={terminal.keyboardActive}
        onPaste={terminal.paste}
        onSend={terminal.sendInput}
        onToggleKeyboard={terminal.toggleKeyboard}
        recorder={recorder}
      />
    )
  } else if (view === "diff") {
    controls = <div className="diff-controls" ref={setDiffControlsContainer} />
  }

  return (
    <main className="terminal-shell">
      <AppHeader
        controls={controls}
        onViewChange={setView}
        sessionTabs={
          view === "terminal" ? (
            <SessionTabs
              activeSession={sessions.activeSession}
              onSelect={sessions.selectSession}
              sessions={sessions.sessions}
            />
          ) : null
        }
        status={terminal.status}
        view={view}
      />
      <div className="view-stage">
        <TerminalView
          activeSession={view === "terminal" ? sessions.activeSession : 0}
          sessions={sessions.sessions}
        />
        {view === "commands" ? (
          <CommandsView
            context={{
              changeFontSize: terminal.changeFontSize,
              sendInput: terminal.sendInput,
            }}
          />
        ) : null}
        {view === "diff" ? (
          <Suspense
            fallback={
              <section
                aria-label="Git diff"
                className="diff-frame diff-frame--active"
              >
                <div className="diff-message" role="status">
                  Loading diff viewer…
                </div>
              </section>
            }
          >
            <DiffView
              active
              controlsContainer={diffControlsContainer}
              session={sessions.activeSession}
            />
          </Suspense>
        ) : null}
      </div>
      {notice === null ? null : (
        <NoticeDialog
          message={notice}
          onDismiss={() => {
            setNotice(null)
          }}
        />
      )}
    </main>
  )
}
