import { Option, Predicate } from "effect"

import { parseClientMessage } from "./protocol.ts"
import { sessionNameFor } from "./sessions.ts"

export interface TerminalSocketData {
  process?: Bun.Subprocess
  sessionNumber?: number
  terminal?: Bun.Terminal
}

export interface TerminalOptions {
  readonly baseSessionName: string
  readonly workingDirectory: string
}

const closeTerminal = (data: TerminalSocketData): void => {
  const { process: subprocess, terminal } = data

  data.process = undefined
  data.terminal = undefined

  if (subprocess && !subprocess.killed) {
    subprocess.kill("SIGHUP")
  }
  if (terminal && !terminal.closed) {
    terminal.close()
  }
}

/** Bun WebSocket callbacks that bridge xterm.js to a persistent tmux session. */
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

    const { process: subprocess, terminal } = socket.data
    if (!terminal || terminal.closed) {
      return
    }

    const message = decoded.value
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
        Bun.spawn([
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
        ])
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
      const environment = {
        ...process.env,
        COLORTERM: "truecolor",
        TERM: "xterm-256color",
      }
      Reflect.deleteProperty(environment, "TMUX")

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
          env: environment,
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
      const detail = error instanceof Error ? error.message : String(error)
      socket.send(
        `\r\n\u001B[31mUnable to start terminal: ${detail}\u001B[0m\r\n`
      )
      socket.close(1011, "Unable to start terminal")
    }
  },
  perMessageDeflate: true,
})
