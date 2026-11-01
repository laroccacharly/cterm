import { readlink } from "node:fs/promises"

import { SerializeAddon } from "@xterm/addon-serialize"
import { Terminal } from "@xterm/headless"

const encoder = new TextEncoder()

/** Lines of history the server mirror keeps, matching the browser's xterm. */
const scrollbackLines = 10_000

/** Where a PTY session sends its output: one connected browser. */
export interface PtyClient {
  readonly send: (output: Uint8Array) => void
  readonly close: () => void
}

/**
 * A shell owned by cterm instead of tmux. A headless xterm mirrors its output
 * so a browser that attaches later receives the real screen and history, and
 * scrolls it locally. The shell lives until it exits or cterm stops.
 */
export interface PtySession {
  readonly attach: (client: PtyClient) => void
  readonly detach: (client: PtyClient) => void
  readonly kill: () => void
  readonly resize: (cols: number, rows: number) => void
  readonly workingDirectory: (fallback: string) => Promise<string>
  readonly write: (data: string) => void
}

const startSession = (
  workingDirectory: string,
  onExit: () => void
): PtySession => {
  const clients = new Set<PtyClient>()
  const mirror = new Terminal({
    allowProposedApi: true,
    cols: 80,
    rows: 24,
    scrollback: scrollbackLines,
  })
  const serializer = new SerializeAddon()
  mirror.loadAddon(serializer)

  const terminal = new Bun.Terminal({
    cols: 80,
    data(_terminal, output) {
      const chunk = new Uint8Array(output)
      // Forward each chunk once the mirror has parsed it, so a snapshot taken
      // by `attach` and the chunks sent after it never overlap or leave a gap.
      mirror.write(chunk, () => {
        for (const client of clients) {
          client.send(chunk)
        }
      })
    },
    name: "xterm-256color",
    rows: 24,
  })

  const environment = {
    ...process.env,
    COLORTERM: "truecolor",
    TERM: "xterm-256color",
  }
  Reflect.deleteProperty(environment, "TMUX")
  const shell = process.env.SHELL ?? "/bin/bash"
  // Bun does not make the PTY the shell's controlling terminal, which job
  // control and Ctrl+C need; `setsid --ctty` does, then execs the shell.
  const subprocess = Bun.spawn(["setsid", "--ctty", shell, "-l"], {
    cwd: workingDirectory,
    env: environment,
    onExit() {
      if (!terminal.closed) {
        terminal.close()
      }
      mirror.dispose()
      for (const client of clients) {
        client.close()
      }
      clients.clear()
      onExit()
    },
    terminal,
  })

  return {
    attach: (client) => {
      // Queue behind pending output so the snapshot includes all of it.
      mirror.write("", () => {
        // RIS clears what the browser showed before it reconnected.
        client.send(encoder.encode(`\u001Bc${serializer.serialize()}`))
        clients.add(client)
      })
    },
    detach: (client) => {
      clients.delete(client)
    },
    kill: () => {
      if (!subprocess.killed) {
        subprocess.kill("SIGHUP")
      }
    },
    resize: (cols, rows) => {
      // With several browsers attached, the last one to resize wins.
      if (cols === mirror.cols && rows === mirror.rows) {
        return
      }
      mirror.resize(cols, rows)
      // The kernel signals SIGWINCH to the foreground job.
      terminal.resize(cols, rows)
    },
    workingDirectory: async (fallback) => {
      try {
        return await readlink(`/proc/${subprocess.pid}/cwd`)
      } catch {
        // The shell exited.
        return fallback
      }
    },
    write: (data) => {
      terminal.write(data)
    },
  }
}

const sessions = new Map<number, PtySession>()

/** The PTY session for a slot, starting a shell if none is running. */
export const ptySession = (
  sessionNumber: number,
  workingDirectory: string
): PtySession => {
  const running = sessions.get(sessionNumber)
  if (running) {
    return running
  }
  const session = startSession(workingDirectory, () => {
    sessions.delete(sessionNumber)
  })
  sessions.set(sessionNumber, session)
  return session
}

/** The PTY session for a slot, if its shell is running. */
export const runningPtySession = (
  sessionNumber: number
): PtySession | undefined => sessions.get(sessionNumber)

/** Kill every PTY shell, for when cterm stops. */
export const killPtySessions = (): void => {
  for (const session of sessions.values()) {
    session.kill()
  }
}
