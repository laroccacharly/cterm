import { Option, Predicate } from "effect"

import { causeMessage } from "../errors/cause.ts"
import { parseClientMessage } from "./protocol.ts"
import type { ClientMessage } from "./protocol.ts"
import { ptySession } from "./pty-sessions.ts"
import type { PtyClient, PtySession } from "./pty-sessions.ts"
import { sessionNameFor, usesTmux } from "./sessions.ts"

export interface TerminalSocketData {
  pty?: { readonly client: PtyClient; readonly session: PtySession }
  process?: Bun.Subprocess
  sessionNumber?: number
  terminal?: Bun.Terminal
}

export interface TerminalOptions {
  readonly baseSessionName: string
  readonly workingDirectory: string
}

/**
 * Environment for every tmux command cterm runs. An inherited `TMUX` would
 * point tmux at the server cterm was launched from, not the one `TMUX_TMPDIR`
 * selects, so session commands could target the wrong server.
 */
export const tmuxEnvironment = () => {
  const environment = {
    ...process.env,
    COLORTERM: "truecolor",
    TERM: "xterm-256color",
  }
  Reflect.deleteProperty(environment, "TMUX")
  return environment
}

const closeTerminal = (data: TerminalSocketData): void => {
  const { process: subprocess, pty, terminal } = data

  // A PTY session outlives the browser, so only stop forwarding to it.
  pty?.session.detach(pty.client)
  delete data.pty

  delete data.process
  delete data.terminal

  if (subprocess && !subprocess.killed) {
    subprocess.kill("SIGHUP")
  }
  if (terminal && !terminal.closed) {
    terminal.close()
  }
}

const handlePtyMessage = (session: PtySession, message: ClientMessage) => {
  switch (message.type) {
    case "input": {
      session.write(message.data)
      return
    }
    case "resize": {
      session.resize(message.cols, message.rows)
      return
    }
    case "reset": {
      // The shell exit closes the socket and the browser reconnects to a
      // fresh one, as with tmux.
      session.kill()
      return
    }
    default: {
      const unhandled: never = message
      throw new Error(`Unhandled terminal message: ${String(unhandled)}`)
    }
  }
}

const openPty = (
  socket: Bun.ServerWebSocket<TerminalSocketData>,
  workingDirectory: string
) => {
  const session = ptySession(socket.data.sessionNumber ?? 1, workingDirectory)
  const client: PtyClient = {
    close: () => {
      socket.close(1000, "Terminal exited")
    },
    send: (output) => {
      socket.sendBinary(output)
    },
  }
  socket.data.pty = { client, session }
  session.attach(client)
}

/**
 * Bun WebSocket callbacks that bridge xterm.js to a persistent tmux session,
 * or to a cterm-owned PTY session for the slot that does not use tmux.
 */
export const terminalWebSocket = (
  options: TerminalOptions
): Bun.WebSocketHandler<TerminalSocketData> => ({
  backpressureLimit: 4 * 1024 * 1024,
  close(socket) {
    closeTerminal(socket.data)
  },
  closeOnBackpressureLimit: true,
  idleTimeout: 120,
  maxPayloadLength: 1024 * 1024,
  message(socket, rawMessage) {
    if (!Predicate.isString(rawMessage)) {
      socket.close(1003, "Text messages only")
      return
    }

    const decoded = parseClientMessage(rawMessage)
    if (Option.isNone(decoded)) {
      socket.close(1007, "Invalid terminal message")
      return
    }

    const message = decoded.value
    const { process: subprocess, pty, terminal } = socket.data
    if (pty) {
      handlePtyMessage(pty.session, message)
      return
    }
    if (!terminal || terminal.closed) {
      return
    }

    switch (message.type) {
      case "input": {
        terminal.write(message.data)
        return
      }
      case "resize": {
        terminal.resize(message.cols, message.rows)
        if (subprocess && !subprocess.killed) {
          subprocess.kill("SIGWINCH")
        }
        return
      }
      case "reset": {
        // With `detach-on-destroy off` tmux would move attached clients to
        // another session instead of exiting, so force it on for this one.
        // The client exit then closes the socket and the browser reconnects
        // to a fresh shell.
        const sessionName = sessionNameFor(
          options.baseSessionName,
          socket.data.sessionNumber ?? 1
        )
        Bun.spawn(
          [
            "tmux",
            "set-option",
            "-t",
            sessionName,
            "detach-on-destroy",
            "on",
            ";",
            "kill-session",
            "-t",
            sessionName,
          ],
          { env: tmuxEnvironment() }
        )
        return
      }
      default: {
        const unhandled: never = message
        throw new Error(`Unhandled terminal message: ${String(unhandled)}`)
      }
    }
  },
  open(socket) {
    try {
      if (!usesTmux(socket.data.sessionNumber ?? 1)) {
        openPty(socket, options.workingDirectory)
        return
      }
      const terminal = new Bun.Terminal({
        cols: 80,
        data(_terminal, output) {
          socket.sendBinary(output)
        },
        name: "xterm-256color",
        rows: 24,
      })

      const sessionName = sessionNameFor(
        options.baseSessionName,
        socket.data.sessionNumber ?? 1
      )
      const subprocess = Bun.spawn(
        [
          "tmux",
          "new-session",
          "-A",
          "-s",
          sessionName,
          "-c",
          options.workingDirectory,
        ],
        {
          cwd: options.workingDirectory,
          env: tmuxEnvironment(),
          onExit() {
            if (!terminal.closed) {
              terminal.close()
            }
            socket.close(1000, "Terminal exited")
          },
          terminal,
        }
      )

      socket.data.terminal = terminal
      socket.data.process = subprocess
    } catch (error) {
      const detail = causeMessage(error)
      socket.send(
        `\r\n\u001B[31mUnable to start terminal: ${detail}\u001B[0m\r\n`
      )
      socket.close(1011, "Unable to start terminal")
    }
  },
  perMessageDeflate: true,
})
