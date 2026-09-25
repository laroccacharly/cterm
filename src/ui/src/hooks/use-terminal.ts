import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Terminal } from "@xterm/xterm"
import { useCallback, useEffect, useRef, useState } from "react"
import type { RefObject } from "react"

export type ConnectionStatus = "connected" | "connecting" | "disconnected"

const reconnectDelays = [250, 500, 1000, 2000, 5000] as const

const defaultFontSize = 14
const minFontSize = 6
const maxFontSize = 40
// oxlint-disable-next-line no-control-regex -- SGR reports begin with ESC.
const invalidMouseReport = /\u001B\[<\d+;NaN;NaN[Mm]/gu

interface KeyboardControl {
  readonly close: () => void
  readonly open: () => void
}

export interface TerminalController {
  readonly changeFontSize: (delta: number) => void
  readonly containerRef: RefObject<HTMLDivElement | null>
  readonly fontSize: number
  readonly isTouchDevice: boolean
  readonly keyboardActive: boolean
  readonly paste: (data: string) => void
  readonly reset: () => void
  readonly sendInput: (data: string) => void
  readonly status: ConnectionStatus
  readonly toggleKeyboard: () => void
}

const websocketUrl = (sessionNumber: number): string => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/ws?session=${sessionNumber}`
}

/** Own the xterm instance, its websocket connection, and touch keyboard. */
export const useTerminal = (
  sessionNumber: number,
  active: boolean
): TerminalController => {
  const containerRef = useRef<HTMLDivElement>(null)
  const pasteRef = useRef<((data: string) => void) | null>(null)
  const sendInputRef = useRef<((data: string) => void) | null>(null)
  const resetRef = useRef<(() => void) | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sendResizeRef = useRef<(() => void) | null>(null)
  const focusRef = useRef<(() => void) | null>(null)
  const keyboardControlRef = useRef<KeyboardControl | null>(null)
  const activeRef = useRef(active)
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [fontSize, setFontSize] = useState(defaultFontSize)
  const [keyboardActive, setKeyboardActive] = useState(false)
  const [isTouchDevice] = useState(
    () => window.matchMedia("(pointer: coarse)").matches
  )

  const paste = useCallback((data: string) => {
    pasteRef.current?.(data)
  }, [])

  const sendInput = useCallback((data: string) => {
    sendInputRef.current?.(data)
  }, [])

  const reset = useCallback(() => {
    resetRef.current?.()
  }, [])

  const changeFontSize = useCallback((delta: number) => {
    setFontSize((size) =>
      Math.min(maxFontSize, Math.max(minFontSize, size + delta))
    )
  }, [])

  const toggleKeyboard = useCallback(() => {
    if (keyboardActive) {
      keyboardControlRef.current?.close()
    } else {
      keyboardControlRef.current?.open()
    }
  }, [keyboardActive])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }
    terminal.options.fontSize = fontSize
    fitAddonRef.current?.fit()
    sendResizeRef.current?.()
  }, [fontSize])

  useEffect(() => {
    activeRef.current = active
    if (!active) {
      keyboardControlRef.current?.close()
      return
    }
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      sendResizeRef.current?.()
      focusRef.current?.()
    })
  }, [active])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      throw new Error("Missing terminal container")
    }

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily:
        '"Berkeley Mono", "JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontSize,
      scrollback: 10_000,
      theme: {
        background: "#1a1b26",
        black: "#1a1b26",
        blue: "#7aa2f7",
        brightBlack: "#414868",
        brightBlue: "#7da6ff",
        brightCyan: "#0db9d7",
        brightGreen: "#b9f27c",
        brightMagenta: "#bb9af7",
        brightRed: "#ff7a93",
        brightWhite: "#c0caf5",
        brightYellow: "#ff9e64",
        cursor: "#c0caf5",
        cyan: "#449dab",
        foreground: "#a9b1d6",
        green: "#9ece6a",
        magenta: "#ad8ee6",
        red: "#f7768e",
        selectionBackground: "#292e42",
        selectionForeground: "#c0caf5",
        white: "#a9b1d6",
        yellow: "#e0af68",
      },
    })
    const fitAddon = new FitAddon()
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())
    terminal.open(container)
    fitAddon.fit()
    terminal.textarea?.setAttribute("aria-label", "Terminal input")

    // On touch devices the soft keyboard should only appear when the user
    // explicitly asks for it, so keep the hidden input read-only (and
    // inputmode "none") until the keyboard toggle enables it.
    const { textarea } = terminal
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches
    const focusTerminal = () => {
      if (!activeRef.current) {
        return
      }
      if (!coarsePointer || textarea?.readOnly === false) {
        terminal.focus()
      }
    }
    focusRef.current = focusTerminal
    const setKeyboardEnabled = (enabled: boolean) => {
      if (!textarea) {
        return
      }
      textarea.readOnly = !enabled
      textarea.inputMode = enabled ? "text" : "none"
    }
    if (coarsePointer) {
      setKeyboardEnabled(false)
    } else {
      terminal.focus()
    }
    const handleFocus = () => {
      if (coarsePointer && textarea) {
        setKeyboardActive(!textarea.readOnly)
      }
    }
    const handleBlur = () => {
      if (coarsePointer) {
        setKeyboardActive(false)
        setKeyboardEnabled(false)
      }
    }
    textarea?.addEventListener("focus", handleFocus)
    textarea?.addEventListener("blur", handleBlur)
    keyboardControlRef.current = {
      close: () => {
        textarea?.blur()
        setKeyboardActive(false)
        setKeyboardEnabled(false)
      },
      open: () => {
        setKeyboardEnabled(true)
        setKeyboardActive(true)
        textarea?.focus()
      },
    }

    let disposed = false
    const fitTimers: ReturnType<typeof setTimeout>[] = []
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let socket: WebSocket | undefined

    const sendResize = () => {
      if (socket?.readyState !== WebSocket.OPEN) {
        return
      }
      socket.send(
        JSON.stringify({
          cols: terminal.cols,
          rows: terminal.rows,
          type: "resize",
        })
      )
    }
    sendResizeRef.current = sendResize

    const fitAndResize = () => {
      fitAddon.fit()
      sendResize()
    }

    const connect = () => {
      if (disposed) {
        return
      }

      setStatus("connecting")
      socket = new WebSocket(websocketUrl(sessionNumber))
      socket.binaryType = "arraybuffer"

      socket.addEventListener("open", () => {
        reconnectAttempt = 0
        setStatus("connected")
        fitAndResize()
        for (const delay of [100, 500, 1000]) {
          fitTimers.push(setTimeout(fitAndResize, delay))
        }
        focusTerminal()
      })

      socket.addEventListener("message", (event) => {
        if (event.data instanceof ArrayBuffer) {
          terminal.write(new Uint8Array(event.data))
          return
        }
        terminal.write(String(event.data))
      })

      socket.addEventListener("close", () => {
        if (disposed) {
          return
        }

        setStatus("disconnected")
        const delay =
          reconnectDelays[
            Math.min(reconnectAttempt, reconnectDelays.length - 1)
          ]
        reconnectAttempt += 1
        reconnectTimer = setTimeout(connect, delay)
      })
    }

    const writeInput = (data: string) => {
      // xterm 6.1 can emit invalid SGR mouse reports during touch inertia.
      // Never forward those reports as literal text to the shell or a TUI.
      const validData = data.replace(invalidMouseReport, "")
      if (validData && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ data: validData, type: "input" }))
      }
    }
    pasteRef.current = (data) => {
      if (data.length === 0) {
        return
      }
      // Go through xterm so bracketed paste and newline normalization apply.
      terminal.paste(data)
      focusTerminal()
    }
    sendInputRef.current = (data) => {
      writeInput(data)
      focusTerminal()
    }
    resetRef.current = () => {
      if (socket?.readyState !== WebSocket.OPEN) {
        return
      }
      socket.send(JSON.stringify({ type: "reset" }))
      terminal.reset()
      focusTerminal()
    }
    const inputDisposable = terminal.onData(writeInput)

    const resizeObserver = new ResizeObserver(() => {
      fitAndResize()
    })
    resizeObserver.observe(container)
    window.visualViewport?.addEventListener("resize", fitAndResize)
    void (async () => {
      await document.fonts.ready
      if (!disposed) {
        requestAnimationFrame(fitAndResize)
      }
    })()

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      for (const timer of fitTimers) {
        clearTimeout(timer)
      }
      resizeObserver.disconnect()
      window.visualViewport?.removeEventListener("resize", fitAndResize)
      inputDisposable.dispose()
      textarea?.removeEventListener("focus", handleFocus)
      textarea?.removeEventListener("blur", handleBlur)
      keyboardControlRef.current = null
      pasteRef.current = null
      sendInputRef.current = null
      resetRef.current = null
      sendResizeRef.current = null
      focusRef.current = null
      fitAddonRef.current = null
      terminalRef.current = null
      socket?.close()
      terminal.dispose()
    }
  }, [])

  return {
    changeFontSize,
    containerRef,
    fontSize,
    isTouchDevice,
    keyboardActive,
    paste,
    reset,
    sendInput,
    status,
    toggleKeyboard,
  }
}
