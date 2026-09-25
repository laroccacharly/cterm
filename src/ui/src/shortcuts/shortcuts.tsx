import { useToaster } from "../components/toaster.tsx"
import type { Recorder, RecorderState } from "../hooks/use-recorder.ts"

interface ShortcutsProps {
  readonly isTouchDevice: boolean
  readonly keyboardActive: boolean
  readonly onPaste: (data: string) => void
  readonly onSend: (data: string) => void
  readonly onToggleKeyboard: () => void
  readonly recorder: Recorder
  readonly voiceCommandRecorder: Recorder
}

const recorderLabel = (
  state: RecorderState,
  kind: "input" | "voice-command"
) => {
  const noun = kind === "voice-command" ? "voice command" : "voice input"
  if (state === "recording") {
    return `Stop ${noun}`
  }
  if (state === "transcribing") {
    return kind === "voice-command"
      ? "Running voice command"
      : "Transcribing voice input"
  }
  return `Start ${noun}`
}

const preventFocusSteal = (event: { preventDefault: () => void }) => {
  event.preventDefault()
}

interface SendShortcut {
  readonly className: string
  readonly data: string
  readonly label: string
  readonly text: string
}

const enterShortcut: SendShortcut = {
  className: "enter-button",
  data: "\r",
  label: "Send Enter",
  text: "⏎",
}

/** Fixed input shortcuts rendered after the optional touch keyboard button. */
const shortcuts: readonly SendShortcut[] = [
  {
    className: "commit-push-button",
    data: "commit and push\r",
    label: "Commit and push",
    text: "C&P",
  },
  {
    className: "new-session-button",
    data: "/new\r",
    label: "New session",
    text: "new",
  },
  {
    className: "control-c-button",
    data: "\u0003",
    label: "Send Ctrl+C",
    text: "Ctrl+C",
  },
  {
    className: "cd-button",
    data: "cd ..\r",
    label: "Change to parent directory",
    text: "cd ..",
  },
  { className: "pi-button", data: "pi\r", label: "Run pi", text: "π" },
  {
    className: "arrow-button arrow-up-button",
    data: "\u001B[A",
    label: "Send Arrow Up",
    text: "↑",
  },
  {
    className: "arrow-button arrow-down-button",
    data: "\u001B[B",
    label: "Send Arrow Down",
    text: "↓",
  },
]

interface SendButtonProps {
  readonly onSend: (data: string) => void
  readonly shortcut: SendShortcut
}

const SendButton = ({ onSend, shortcut }: SendButtonProps) => (
  <button
    aria-label={shortcut.label}
    className={shortcut.className}
    onClick={() => {
      onSend(shortcut.data)
    }}
    onMouseDown={preventFocusSteal}
    title={shortcut.label}
    type="button"
  >
    <span aria-hidden="true">{shortcut.text}</span>
  </button>
)

/**
 * Shortcut buttons shown above the terminal. Commands are a separate concept
 * and live in the Commands page, not here.
 */
export const Shortcuts = ({
  isTouchDevice,
  keyboardActive,
  onPaste,
  onSend,
  onToggleKeyboard,
  recorder,
  voiceCommandRecorder,
}: ShortcutsProps) => {
  const toaster = useToaster()

  const pasteFromClipboard = async () => {
    if (!window.isSecureContext) {
      toaster.error("Clipboard is unavailable")
      return
    }

    try {
      const text = await navigator.clipboard.readText()
      if (text.length === 0) {
        return
      }
      onPaste(text)
    } catch (error) {
      toaster.error(
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Couldn't read the clipboard"
      )
    }
  }
  return (
    <div aria-label="Terminal shortcuts" className="terminal-controls">
      <button
        aria-label={recorderLabel(voiceCommandRecorder.state, "voice-command")}
        className={`voice-button voice-command-button voice-button--${voiceCommandRecorder.state}`}
        disabled={voiceCommandRecorder.state === "transcribing"}
        onClick={voiceCommandRecorder.toggle}
        onMouseDown={preventFocusSteal}
        title={recorderLabel(voiceCommandRecorder.state, "voice-command")}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v10h14V7H5Zm2.2 1.3 3.1 3.1-3.1 3.1-1.1-1.1L8.3 11 6.1 8.8l1.1-1.1ZM11 13h5v1.4h-5V13Z" />
        </svg>
      </button>
      <button
        aria-label={recorderLabel(recorder.state, "input")}
        className={`voice-button voice-button--${recorder.state}`}
        disabled={recorder.state === "transcribing"}
        onClick={recorder.toggle}
        onMouseDown={preventFocusSteal}
        title={recorderLabel(recorder.state, "input")}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm-1-9a1 1 0 0 1 2 0v6a1 1 0 0 1-2 0V5Zm7 6a6 6 0 0 1-5 5.91V19h3v2H8v-2h3v-2.09A6 6 0 0 1 6 11h2a4 4 0 0 0 8 0h2Z" />
        </svg>
      </button>
      <SendButton onSend={onSend} shortcut={enterShortcut} />
      {isTouchDevice ? (
        <button
          aria-label={keyboardActive ? "Hide keyboard" : "Show keyboard"}
          aria-pressed={keyboardActive}
          className={`keyboard-button keyboard-button--${keyboardActive ? "active" : "inactive"}`}
          onClick={onToggleKeyboard}
          onMouseDown={preventFocusSteal}
          title={keyboardActive ? "Hide keyboard" : "Show keyboard"}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm-9 3h2v2h-2V8Zm0 3h2v2h-2v-2ZM8 8h2v2H8V8Zm0 3h2v2H8v-2Zm-1 2H5v-2h2v2Zm0-3H5V8h2v2Zm9 7H8v-2h8v2Zm0-4h-2v-2h2v2Zm0-3h-2V8h2v2Zm3 3h-2v-2h2v2Zm0-3h-2V8h2v2Z" />
          </svg>
        </button>
      ) : null}
      {shortcuts.map((shortcut) => (
        <SendButton
          key={shortcut.className}
          onSend={onSend}
          shortcut={shortcut}
        />
      ))}
      <button
        aria-label="Paste from clipboard"
        className="paste-button"
        onClick={() => {
          void pasteFromClipboard()
        }}
        onMouseDown={preventFocusSteal}
        title="Paste from clipboard"
        type="button"
      >
        <span aria-hidden="true">Paste</span>
      </button>
    </div>
  )
}
