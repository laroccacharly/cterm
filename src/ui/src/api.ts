import { Effect, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

import { DiffResponseSchema } from "../../api/diff.ts"
import type { DiffResponse } from "../../api/diff.ts"
import { ApiError, ApiErrorSchema } from "../../api/error.ts"
import {
  TranscriptionModelBodySchema,
  TranscriptionResponseSchema,
} from "../../api/transcription.ts"
import type { TranscriptionModel } from "../../api/transcription.ts"
import { uploadFilenameHeader, UploadResponseSchema } from "../../api/upload.ts"
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

/** Switch the speech-to-text model used for every later recording. */
export const setTranscriptionModel = (
  model: TranscriptionModel
): Effect.Effect<TranscriptionModel, ApiError, HttpClient.HttpClient> =>
  execute(
    HttpClientRequest.post(url("/transcription-model")).pipe(
      HttpClientRequest.bodyJsonUnsafe({ model })
    )
  ).pipe(
    Effect.flatMap(
      HttpClientResponse.schemaBodyJson(TranscriptionModelBodySchema)
    ),
    Effect.map((result) => result.model),
    Effect.mapError(unexpected)
  )

const uploadFile = (
  file: File
): Effect.Effect<string, ApiError, HttpClient.HttpClient> =>
  Effect.gen(function* uploadFileEffect() {
    const data = yield* Effect.tryPromise({
      catch: (cause) =>
        new ApiError({ cause, message: `Could not read ${file.name}` }),
      try: async () => new Uint8Array(await file.arrayBuffer()),
    })
    const request = HttpClientRequest.post(url("/upload")).pipe(
      HttpClientRequest.setHeader(
        uploadFilenameHeader,
        encodeURIComponent(file.name)
      ),
      HttpClientRequest.bodyUint8Array(
        data,
        file.type || "application/octet-stream"
      )
    )
    const response = yield* execute(request)
    const result = yield* HttpClientResponse.schemaBodyJson(
      UploadResponseSchema
    )(response).pipe(Effect.mapError(unexpected))
    return result.path
  })

/** Save files on the cterm host and return their absolute paths, in order. */
export const uploadFiles = (
  files: readonly File[]
): Effect.Effect<readonly string[], ApiError, HttpClient.HttpClient> =>
  Effect.forEach(files, uploadFile, { concurrency: 4 })

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
