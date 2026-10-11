import { useEffect } from "react"

interface UploadDialogProps {
  readonly dragging: boolean
  readonly onClose: () => void
  readonly onFiles: (files: readonly File[]) => void
}

/** Pick, drop or paste files whose saved paths are pasted into the terminal. */
export const UploadDialog = ({
  dragging,
  onClose,
  onFiles,
}: UploadDialogProps) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [onClose])

  return (
    <div
      className="notice-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        aria-label="Attach files"
        aria-modal="true"
        className="notice-dialog upload-dialog"
        role="dialog"
      >
        <label
          className={`upload-drop-zone${dragging ? " upload-drop-zone--active" : ""}`}
        >
          <span>Drop, paste or choose files</span>
          <span className="upload-drop-zone__hint">
            Their paths are pasted into the terminal
          </span>
          <input
            aria-label="Choose files"
            autoFocus
            className="upload-drop-zone__input"
            multiple
            onChange={(event) => {
              onFiles([...(event.currentTarget.files ?? [])])
            }}
            type="file"
          />
        </label>
        <button
          className="notice-dialog__button"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
