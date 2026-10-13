import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"

const TOAST_DURATION_MS = 5000

type ToastTone = "error" | "info"

interface Toast {
  readonly id: number
  readonly message: string
  readonly tone: ToastTone
}

interface Toaster {
  readonly error: (message: string) => void
  readonly info: (message: string) => void
}

const ToasterContext = createContext<Toaster | null>(null)

/** Access the app-wide error toaster. */
export const useToaster = (): Toaster => {
  const toaster = useContext(ToasterContext)
  if (toaster === null) {
    throw new Error("useToaster must be used inside <ToasterProvider>")
  }
  return toaster
}

const ToastItem = ({
  onDismiss,
  toast,
}: {
  readonly onDismiss: (id: number) => void
  readonly toast: Toast
}) => {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(toast.id)
    }, TOAST_DURATION_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [onDismiss, toast.id])

  return (
    <li
      className={`toast toast--${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
    >
      <span className="toast__message">{toast.message}</span>
      <button
        aria-label="Dismiss"
        className="toast__close"
        onClick={() => {
          onDismiss(toast.id)
        }}
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        type="button"
      >
        ×
      </button>
    </li>
  )
}

/** Renders stacked, auto-dismissing toasts for the whole app. */
export const ToasterProvider = ({
  children,
}: {
  readonly children: ReactNode
}) => {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const toaster = useMemo<Toaster>(() => {
    const show = (tone: ToastTone) => (message: string) => {
      nextId.current += 1
      const id = nextId.current
      setToasts((current) => [
        ...current.filter((toast) => toast.message !== message),
        { id, message, tone },
      ])
    }
    return { error: show("error"), info: show("info") }
  }, [])

  return (
    <ToasterContext.Provider value={toaster}>
      {children}
      <ol aria-label="Notifications" className="toaster">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} onDismiss={dismiss} toast={toast} />
        ))}
      </ol>
    </ToasterContext.Provider>
  )
}
