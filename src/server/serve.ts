import { Effect, Layer, Schema } from "effect"

import { VoiceCommandSelector } from "../commands/voice-command.ts"
import type { VoiceCommandSelectorService } from "../commands/voice-command.ts"
import type { CtermConfig } from "../config/config.ts"
import { Credentials } from "../credentials/credentials.ts"
import type { TranscriptionService } from "../openrouter/transcription.ts"
import { Transcription } from "../openrouter/transcription.ts"
import { ModelsStore } from "../models/store.ts"
import type { ModelsStoreService } from "../models/store.ts"
import { parseSessionNumber } from "../terminal/sessions.ts"
import type { TerminalSocketData } from "../terminal/socket.ts"
import { terminalWebSocket } from "../terminal/socket.ts"
import { createHttpHandler, isSameOrigin } from "./router.ts"
import { maxAudioBytes } from "./transcribe.ts"

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; connect-src 'self'; font-src 'self' data:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const

/** Raised when the HTTP or terminal server cannot start. */
export class ServerError extends Schema.TaggedError<ServerError>()(
  "ServerError",
  {
    cause: Schema.Defect(),
    detail: Schema.String,
  }
) {}

const withSecurityHeaders = (response: Response): Response => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value)
  }
  return response
}

interface CtermServer {
  readonly dispose: () => Promise<void>
  readonly server: Bun.Server<TerminalSocketData>
}

const makeServer = (
  config: CtermConfig,
  transcription: TranscriptionService,
  voiceCommandSelector: VoiceCommandSelectorService,
  models: ModelsStoreService
): CtermServer => {
  const baseSessionName = process.env.CTERM_TMUX_SESSION ?? config.sessionName
  const http = createHttpHandler({
    baseSessionName,
    config,
    models,
    transcription,
    voiceCommandSelector,
  })

  const server = Bun.serve<TerminalSocketData>({
    async fetch(request, socketServer) {
      const url = new URL(request.url)

      if (url.pathname === "/ws") {
        if (!isSameOrigin(request)) {
          return new Response("Forbidden", {
            headers: securityHeaders,
            status: 403,
          })
        }

        const upgraded = socketServer.upgrade(request, {
          data: {
            sessionNumber: parseSessionNumber(url.searchParams.get("session")),
          },
        })
        return upgraded
          ? undefined
          : new Response("WebSocket upgrade required", {
              headers: securityHeaders,
              status: 426,
            })
      }

      return withSecurityHeaders(await http.handler(request))
    },
    hostname: "127.0.0.1",
    maxRequestBodySize: maxAudioBytes,
    port: config.port,
    websocket: terminalWebSocket({
      baseSessionName,
      workingDirectory: config.workingDirectory,
    }),
  })

  return { dispose: http.dispose, server }
}

const acquireServer = (config: CtermConfig) =>
  Effect.gen(function* acquireServerEffect() {
    const transcription = yield* Transcription
    const voiceCommandSelector = yield* VoiceCommandSelector
    const models = yield* ModelsStore
    return yield* Effect.try({
      try: () => {
        if (Bun.which("tmux") === null) {
          throw new Error("tmux is required but was not found in PATH")
        }
        return makeServer(config, transcription, voiceCommandSelector, models)
      },
      catch: (cause) =>
        new ServerError({
          cause,
          detail: `listen on 127.0.0.1:${config.port}`,
        }),
    })
  })

/** Scoped server layer; interruption closes HTTP and all connected terminals. */
export const serverLayer = (config: CtermConfig) =>
  Layer.effectDiscard(
    Effect.acquireRelease(acquireServer(config), (instance) =>
      Effect.promise(async () => {
        try {
          await instance.server.stop(true)
        } finally {
          await instance.dispose()
        }
      })
    )
  ).pipe(
    Layer.provide(Transcription.layer),
    Layer.provide(VoiceCommandSelector.layer),
    Layer.provide(ModelsStore.layer),
    Layer.provide(Credentials.layer)
  )
