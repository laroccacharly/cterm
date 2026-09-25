import { useEffect } from "react"

interface NoticeDialogProps {
  readonly message: string
  readonly onDismiss: () => void
}

/** A minimal modal alert shown when the app needs the user's attention. */
export const NoticeDialog = ({ message, onDismiss }: NoticeDialogProps) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [onDismiss])

  return (
    <div className="notice-backdrop">
      <div
        aria-label="Notice"
        aria-modal="true"
        className="notice-dialog"
        role="alertdialog"
      >
        <p className="notice-dialog__message">{message}</p>
        <button
          autoFocus
          className="notice-dialog__button"
          onClick={onDismiss}
          type="button"
        >
          OK
        </button>
      </div>
    </div>
  )
}
