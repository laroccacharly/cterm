import path from "node:path"

import { Effect } from "effect"
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http"

import { commands } from "../commands/commands.ts"
import type { VoiceCommandSelectorService } from "../commands/voice-command.ts"
import type { CtermConfig } from "../config/config.ts"
import type { TranscriptionService } from "../elevenlabs/transcription.ts"
import { commandCatalogue } from "../models/models.ts"
import type { ModelsStoreService } from "../models/store.ts"
import { parseSessionNumber, sessionNameFor } from "../terminal/sessions.ts"
import { commandsHttpResponse } from "./commands.ts"
import { gitDiffResponse, terminalWorkingDirectory } from "./diff.ts"
import { healthResponse } from "./health.ts"
import { jsonError } from "./http.ts"
import { transcribeResponse } from "./transcribe.ts"
import { uiDirectory } from "./ui.ts"
import { voiceCommandResponse } from "./voice-command.ts"

const uiRoot = path.resolve(uiDirectory)

/**
 * Protect command-capable endpoints from cross-site requests by comparing the
 * browser-supplied origin against the host the request was addressed to.
 */
export const isSameOrigin = (request: {
  readonly headers: Headers
}): boolean => {
  const origin = request.headers.get("origin")
  const host = request.headers.get("host")
  const forwardedHost = request.headers.get("x-forwarded-host")

  if (origin === null || origin === "") {
    return false
  }

  try {
    const originHost = new URL(origin).host
    return originHost === host || originHost === forwardedHost
  } catch {
    return false
  }
}

const noStore = (
  response: HttpServerResponse.HttpServerResponse
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.setHeader(response, "Cache-Control", "no-store")

const fileResponse = (filePath: string, cacheControl: string): Response =>
  new Response(Bun.file(filePath), {
    headers: { "Cache-Control": cacheControl },
  })

const staticResponse = async (pathname: string): Promise<Response> => {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1)
  const requestedPath = path.resolve(uiRoot, relativePath)
  const insideUiRoot = requestedPath.startsWith(`${uiRoot}${path.sep}`)

  if (insideUiRoot && (await Bun.file(requestedPath).exists())) {
    const immutable = relativePath.startsWith("assets/")
    return fileResponse(
      requestedPath,
      immutable ? "public, max-age=31536000, immutable" : "no-cache"
    )
  }

  return new Response("Not found", { status: 404 })
}

const methodNotAllowed = (): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.fromWeb(
    new Response("Method not allowed", { status: 405 })
  )

const staticRoute = HttpRouter.route("*", "*", (request) =>
  Effect.gen(function* staticRouteHandler() {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed()
    }

    const web = yield* HttpServerRequest.toWeb(request)
    const { pathname } = new URL(web.url)
    const response = yield* Effect.promise(
      async () => await staticResponse(pathname)
    )
    return HttpServerResponse.fromWeb(response)
  })
)

export interface HttpHandlerOptions {
  readonly baseSessionName: string
  readonly config: CtermConfig
  readonly models: ModelsStoreService
  readonly transcription: TranscriptionService
  readonly voiceCommandSelector: VoiceCommandSelectorService
}

/**
 * Builds the Effect HTTP router for cterm and adapts it to a Fetch-compatible
 * handler. The WebSocket upgrade is handled separately by the Bun server.
 */
export const createHttpHandler = ({
  baseSessionName,
  config,
  models,
  transcription,
  voiceCommandSelector,
}: HttpHandlerOptions) => {
  const guardedPost = (
    routePath: HttpRouter.PathInput,
    handle: (
      request: HttpServerRequest.HttpServerRequest
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse>
  ) =>
    HttpRouter.route("POST", routePath, (request) =>
      Effect.gen(function* guardedPostHandler() {
        const web = yield* HttpServerRequest.toWeb(request)
        if (!isSameOrigin(web)) {
          return HttpServerResponse.fromWeb(
            new Response("Forbidden", { status: 403 })
          )
        }

        return yield* handle(request)
      })
    )

  const diffRoute = HttpRouter.route("GET", "/diff", (request) =>
    Effect.gen(function* diffRouteHandler() {
      const web = yield* HttpServerRequest.toWeb(request)
      const sessionNumber = parseSessionNumber(
        new URL(web.url).searchParams.get("session")
      )
      const directory = yield* Effect.promise(
        async () =>
          await terminalWorkingDirectory(
            sessionNameFor(baseSessionName, sessionNumber),
            config.workingDirectory
          )
      )
      const response = yield* Effect.promise(
        async () => await gitDiffResponse(directory)
      )
      return noStore(HttpServerResponse.fromWeb(response))
    })
  )

  const commandsRoute = HttpRouter.route("GET", "/commands", () =>
    Effect.gen(function* commandsRouteHandler() {
      const vetted = yield* models.list()
      return noStore(commandsHttpResponse(commandCatalogue(commands, vetted)))
    }).pipe(
      Effect.catchTag("ModelsError", () =>
        Effect.succeed(
          HttpServerResponse.fromWeb(
            jsonError(
              500,
              "commands_failed",
              "Could not read the vetted model list"
            )
          )
        )
      )
    )
  )

  const routes = [
    HttpRouter.route(
      "GET",
      "/health",
      noStore(HttpServerResponse.jsonUnsafe(healthResponse))
    ),
    guardedPost("/transcribe", (request) =>
      transcribeResponse(request, transcription)
    ),
    guardedPost("/voice-command", (request) =>
      voiceCommandResponse(request, voiceCommandSelector)
    ),
    commandsRoute,
    diffRoute,
    staticRoute,
  ]

  return HttpRouter.toWebHandler(HttpRouter.addAll(routes), {
    disableLogger: true,
  })
}
