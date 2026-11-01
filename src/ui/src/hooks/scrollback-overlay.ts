import { Terminal } from "@xterm/xterm"
import { Option, Schema } from "effect"

import type { ScrollbackResponse } from "../../../api/scrollback.ts"
import { terminalFontFamily, terminalTheme } from "./terminal-theme.ts"

// xterm dispatches these from its touch gesture recognizer
// (src/browser/scrollable/touch.ts). They are not public API, so the e2e
// tests pin the behaviour that depends on them.
const gestureStart = "-xterm-gesturestart"
const gestureChange = "-xterm-gesturechange"
const gestureTap = "-xterm-gesturetap"

const scrollbackRows = 10_000

const decodeGesture = Schema.decodeUnknownOption(
  Schema.Struct({ translationY: Schema.Finite })
)

/** Vertical finger movement since the previous gesture event, in pixels. */
const translationY = (event: Event): number =>
  Option.match(decodeGesture(event), {
    onNone: () => 0,
    onSome: (gesture) => gesture.translationY,
  })

interface ScrollbackView {
  readonly dispose: () => void
  readonly terminal: Terminal
}

/**
 * - `idle`: the next swipe fetches the history.
 * - `loading`: swallow the swipe while the history is on its way.
 * - `open`: the read-only view covers the live terminal and scrolls locally.
 * - `passthrough`: a full-screen app owns this swipe; leave it to xterm.
 * - `ignoring`: swallow what is left of a swipe that closed the view.
 */
type Phase = "idle" | "ignoring" | "loading" | "open" | "passthrough"

export interface ScrollbackOverlay {
  readonly close: () => void
  readonly dispose: () => void
}

/** For sessions whose live terminal already scrolls its own history. */
export const noScrollbackOverlay: ScrollbackOverlay = {
  close: () => {
    // Nothing is open.
  },
  dispose: () => {
    // Nothing is attached.
  },
}

interface ScrollbackOverlayOptions {
  readonly container: HTMLElement
  readonly live: Terminal
  readonly load: () => Promise<ScrollbackResponse>
}

/** Render a history snapshot in a read-only xterm laid over the live one. */
const openView = async (
  container: HTMLElement,
  live: Terminal,
  content: string
): Promise<ScrollbackView> => {
  const host = document.createElement("div")
  host.className = "terminal-scrollback"
  host.dataset.testid = "terminal-scrollback"
  container.append(host)

  const terminal = new Terminal({
    cols: live.cols,
    convertEol: true,
    cursorBlink: false,
    disableStdin: true,
    fontFamily: terminalFontFamily,
    fontSize: live.options.fontSize,
    rows: live.rows,
    scrollback: scrollbackRows,
    theme: terminalTheme,
  })
  terminal.open(host)
  // Never let a tap in the view raise the soft keyboard.
  const { textarea } = terminal
  if (textarea) {
    textarea.readOnly = true
    textarea.inputMode = "none"
    textarea.tabIndex = -1
    textarea.setAttribute("aria-hidden", "true")
    textarea.setAttribute("aria-label", "Terminal history")
  }

  // oxlint-disable-next-line promise/avoid-new -- xterm reports a finished write only through a callback.
  await new Promise<void>((resolve) => {
    // Hide the cursor: the snapshot is not where input goes.
    terminal.write(`\u001B[?25l${content}`, resolve)
  })
  terminal.scrollToBottom()

  return {
    dispose: () => {
      terminal.dispose()
      host.remove()
    },
    terminal,
  }
}

/**
 * Scroll terminal history on touch devices without a network round trip.
 *
 * With tmux mouse mode on, xterm turns every swipe step into a wheel report
 * that tmux answers with a full redraw. Instead, the first swipe step fetches
 * the tmux history once and shows it in a read-only xterm over the live one;
 * the rest of the swipe, and later swipes, scroll that view locally. Tapping,
 * typing, resizing, or scrolling back to the bottom returns to the live
 * terminal. Panes running a full-screen app keep receiving the swipes.
 */
export const attachScrollbackOverlay = ({
  container,
  live,
  load,
}: ScrollbackOverlayOptions): ScrollbackOverlay => {
  let phase: Phase = "idle"
  let view: ScrollbackView | undefined
  // Pixels swiped toward older lines that have not become whole lines yet.
  let pendingPixels = 0
  // The last snapshot came from a full-screen app: let swipes through at once
  // and recheck in the background, so the app never waits on the network.
  let appOwnsSwipes = false

  const cellHeight = (): number => {
    const screen = live.element?.querySelector(".xterm-screen")
    return screen ? screen.clientHeight / live.rows : 0
  }

  const insideView = (event: Event): boolean =>
    event.target instanceof Node &&
    view?.terminal.element?.contains(event.target) === true

  const close = () => {
    view?.dispose()
    view = undefined
    pendingPixels = 0
    if (phase === "loading" || phase === "open") {
      phase = "ignoring"
    }
  }

  const scrollView = (target: ScrollbackView) => {
    const height = cellHeight()
    if (height === 0) {
      return
    }
    const lines = Math.trunc(pendingPixels / height)
    pendingPixels -= lines * height
    target.terminal.scrollLines(lines)
  }

  const recheck = async () => {
    try {
      const { fullScreenApp } = await load()
      appOwnsSwipes = fullScreenApp
    } catch {
      // Keep passing swipes through; the next swipe tries again.
    }
  }

  const open = async () => {
    let scrollback: ScrollbackResponse
    try {
      scrollback = await load()
    } catch {
      // Without history, e.g. while an older server is running, scroll the
      // way xterm always has until a recheck succeeds.
      appOwnsSwipes = true
      phase = phase === "loading" ? "passthrough" : phase
      pendingPixels = 0
      return
    }
    const { content, fullScreenApp } = scrollback
    appOwnsSwipes = fullScreenApp
    if (phase !== "loading") {
      return
    }
    if (fullScreenApp) {
      phase = "passthrough"
      pendingPixels = 0
      return
    }

    const opened = await openView(container, live, content)
    if (phase !== "loading") {
      opened.dispose()
      return
    }
    view = opened
    phase = "open"
    scrollView(opened)
    const { buffer } = opened.terminal
    if (buffer.active.viewportY >= buffer.active.baseY) {
      // Swiped toward newer lines or there is no history: nothing to show.
      close()
      return
    }
    opened.terminal.onScroll(() => {
      if (view === opened && buffer.active.viewportY >= buffer.active.baseY) {
        close()
      }
    })
  }

  const handleStart = (event: Event) => {
    if (insideView(event)) {
      return
    }
    if (phase === "ignoring" || phase === "passthrough") {
      phase = "idle"
    }
  }

  const handleChange = (event: Event) => {
    // Swipes that start on the view are scrolled by its own xterm.
    if (insideView(event)) {
      return
    }
    if (phase === "passthrough") {
      return
    }
    if (phase === "idle" && appOwnsSwipes) {
      phase = "passthrough"
      void recheck()
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    // A finger moving down reveals older lines, which xterm scrolls up to.
    pendingPixels -= translationY(event)
    if (phase === "idle") {
      phase = "loading"
      void open()
    } else if (phase === "open" && view) {
      scrollView(view)
    }
  }

  const handleTap = (event: Event) => {
    if (insideView(event)) {
      event.stopImmediatePropagation()
      close()
    }
  }

  // Capture on an ancestor runs before xterm's handlers on its screen element,
  // even though gesture events do not bubble.
  container.addEventListener(gestureStart, handleStart, { capture: true })
  container.addEventListener(gestureChange, handleChange, { capture: true })
  container.addEventListener(gestureTap, handleTap, { capture: true })

  return {
    close,
    dispose: () => {
      container.removeEventListener(gestureStart, handleStart, {
        capture: true,
      })
      container.removeEventListener(gestureChange, handleChange, {
        capture: true,
      })
      container.removeEventListener(gestureTap, handleTap, { capture: true })
      close()
    },
  }
}
