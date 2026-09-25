import { Effect, Option, Schema } from "effect"
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http"

import { DiffResponseSchema } from "../../api/diff.ts"
import type { DiffResponse } from "../../api/diff.ts"
import { ApiError, ApiErrorSchema } from "../../api/error.ts"
import { TranscriptionResponseSchema } from "../../api/transcription.ts"
import { VoiceCommandResponseSchema } from "../../api/voice-command.ts"
import { CommandsResponseSchema } from "../../commands/commands.ts"
import type { Command, CommandsResponse } from "../../commands/commands.ts"

const baseUrl = window.location.origin

const url = (path: string): string => `${baseUrl}${path}`

const decodeErrorBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(ApiErrorSchema)
)

const errorFrom = (status: number, body: string): ApiError => {
  const decoded = decodeErrorBody(body)
  return new ApiError({
    message: Option.isSome(decoded)
      ? decoded.value.message
      : `Request failed with status ${status}`,
    status,
  })
}

const execute = (
  request: HttpClientRequest.HttpClientRequest
): Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  ApiError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* executeRequest() {
    const client = yield* HttpClient.HttpClient
    const response = yield* client
      .execute(request)
      .pipe(
        Effect.mapError(
          (cause) => new ApiError({ cause, message: "Request failed" })
        )
      )

    if (response.status < 200 || response.status >= 300) {
      const body = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
      return yield* errorFrom(response.status, body)
    }

    return response
  })

const unexpected = (cause: unknown): ApiError =>
  cause instanceof ApiError
    ? cause
    : new ApiError({ cause, message: "Unexpected response" })

/** Read the catalogue that powers the Commands page. */
export const fetchCommands: Effect.Effect<
  CommandsResponse,
  ApiError,
  HttpClient.HttpClient
> = execute(HttpClientRequest.get(url("/commands"))).pipe(
  Effect.flatMap(HttpClientResponse.schemaBodyJson(CommandsResponseSchema)),
  Effect.mapError(unexpected)
)

/**
 * Read all tracked changes for the repository containing the working
 * directory of the requested terminal session.
 */
export const fetchCurrentDiff = (
  session: number
): Effect.Effect<DiffResponse, ApiError, HttpClient.HttpClient> =>
  execute(HttpClientRequest.get(url(`/diff?session=${session}`))).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(DiffResponseSchema)),
    Effect.mapError(unexpected)
  )

/** Send a recorded clip to cterm and return its transcript. */
export const transcribeAudio = (
  audio: Blob
): Effect.Effect<string, ApiError, HttpClient.HttpClient> =>
  Effect.gen(function* transcribeAudioEffect() {
    const data = yield* Effect.tryPromise({
      catch: (cause) =>
        new ApiError({ cause, message: "Could not read the recording" }),
      try: async () => new Uint8Array(await audio.arrayBuffer()),
    })
    const request = HttpClientRequest.post(url("/transcribe")).pipe(
      HttpClientRequest.bodyUint8Array(data, audio.type || "audio/webm")
    )
    const response = yield* execute(request)
    const result = yield* HttpClientResponse.schemaBodyJson(
      TranscriptionResponseSchema
    )(response).pipe(Effect.mapError(unexpected))
    return result.text
  })

/** Ask the server (and jev) to pick a supported command for a spoken transcript. */
export const selectVoiceCommand = (
  transcript: string
): Effect.Effect<Command | null, ApiError, HttpClient.HttpClient> =>
  execute(
    HttpClientRequest.post(url("/voice-command")).pipe(
      HttpClientRequest.bodyJsonUnsafe({ transcript })
    )
  ).pipe(
    Effect.flatMap(
      HttpClientResponse.schemaBodyJson(VoiceCommandResponseSchema)
    ),
    Effect.map((result) => result.command),
    Effect.mapError(unexpected)
  )
