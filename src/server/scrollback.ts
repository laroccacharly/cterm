import type { ScrollbackResponse } from "../api/scrollback.ts"
import { tmuxEnvironment } from "../terminal/socket.ts"
import { jsonError } from "./http.ts"

/** Lines of tmux history sent to the browser, matching xterm's scrollback. */
export const scrollbackLines = 10_000

const tmux = async (
  ...args: readonly string[]
): Promise<{ readonly exitCode: number; readonly stdout: string }> => {
  const subprocess = Bun.spawn(["tmux", ...args], {
    env: tmuxEnvironment(),
    stderr: "ignore",
    stdout: "pipe",
  })
  const [exitCode, stdout] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
  ])
  return { exitCode, stdout }
}

const readScrollback = async (
  sessionName: string
): Promise<ScrollbackResponse | undefined> => {
  const state = await tmux(
    "display-message",
    "-p",
    "-t",
    sessionName,
    "#{alternate_on}#{mouse_any_flag}"
  )
  if (state.exitCode !== 0) {
    return undefined
  }
  if (state.stdout.trim() !== "00") {
    return { content: "", fullScreenApp: true }
  }

  const capture = await tmux(
    "capture-pane",
    "-p",
    "-e",
    "-S",
    `-${scrollbackLines}`,
    "-t",
    sessionName
  )
  if (capture.exitCode !== 0) {
    return undefined
  }
  // Drop the final newline so the last pane row lands on the last screen row.
  return { content: capture.stdout.replace(/\n$/u, ""), fullScreenApp: false }
}

/**
 * Snapshot a session's history for client-side scrolling. The body is gzipped
 * when the browser accepts it: colored history compresses roughly tenfold.
 */
export const scrollbackResponse = async (
  sessionName: string,
  acceptEncoding: string
): Promise<Response> => {
  const scrollback = await readScrollback(sessionName)
  if (scrollback === undefined) {
    return jsonError(
      404,
      "session_not_found",
      "The terminal session is not running."
    )
  }

  if (!acceptEncoding.includes("gzip")) {
    return Response.json(scrollback)
  }
  return new Response(Bun.gzipSync(JSON.stringify(scrollback)), {
    headers: {
      "Content-Encoding": "gzip",
      "Content-Type": "application/json",
    },
  })
}
