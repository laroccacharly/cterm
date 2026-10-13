import {
  Context,
  Effect,
  flow,
  Layer,
  Option,
  Redacted,
  Schedule,
  Schema,
} from "effect"
import {
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http"

import { TranscriptionResponseSchema } from "../api/transcription.ts"
import type {
  TranscriptionModel,
  TranscriptionResponse,
} from "../api/transcription.ts"
import { Config } from "../config/config.ts"
import {
  Credentials,
  OPENROUTER_API_KEY_ENV,
} from "../credentials/credentials.ts"
import { remuxToOgg } from "../ffmpeg/ffmpeg.ts"

export const OPENROUTER_TRANSCRIPTION_ENDPOINT =
  "https://openrouter.ai/api/v1/audio/transcriptions"

export interface TranscribeInput {
  readonly data: ArrayBuffer
  readonly contentType: string
}

/** Maps a browser audio MIME type to the format name sent to OpenRouter. */
export const formatFor = (contentType: string): string => {
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? ""

  switch (base) {
    case "audio/mp4": {
      return "mp4"
    }
    case "audio/mpeg": {
      return "mp3"
    }
    case "audio/ogg": {
      return "ogg"
    }
    case "audio/wav":
    case "audio/x-wav": {
      return "wav"
    }
    default: {
      return "webm"
    }
  }
}

/**
 * Microsoft's provider rejects the WebM and MP4 containers browsers record,
 * so those are converted to ogg first. ElevenLabs takes them as-is.
 */
export const needsOgg = (model: TranscriptionModel, format: string): boolean =>
  model.startsWith("microsoft/") && !["mp3", "ogg", "wav"].includes(format)

/** Raised when recorded audio cannot be transcribed. */
export class TranscriptionError extends Schema.TaggedError<TranscriptionError>()(
  "TranscriptionError",
  {
    cause: Schema.Defect(),
    detail: Schema.String,
  }
) {
  get message(): string {
    return this.detail
  }
}

const decodeErrorBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({ error: Schema.Struct({ message: Schema.String }) })
  )
)

/** Extract OpenRouter's error message (or raw body) from a failed request. */
const describeFailure = (cause: unknown): Effect.Effect<string> => {
  if (!HttpClientError.isHttpClientError(cause)) {
    return Effect.succeed(String(cause))
  }
  const { response } = cause
  if (response === undefined) {
    return Effect.succeed(cause.message)
  }
  return response.text.pipe(
    Effect.map((body) => {
      const message = Option.getOrUndefined(decodeErrorBody(body))?.error
        .message
      return `HTTP ${response.status}: ${message ?? (body.trim() || "empty response")}`
    }),
    Effect.orElseSucceed(() => `HTTP ${response.status}`)
  )
}

export interface TranscriptionService {
  readonly transcribe: (
    input: TranscribeInput
  ) => Effect.Effect<TranscriptionResponse, TranscriptionError>
}

/** Provider options OpenRouter forwards for a given model. */
const providerFor = (model: TranscriptionModel) =>
  model.startsWith("microsoft/")
    ? {
        provider: {
          options: {
            azure: {
              enhancedMode: { modelOptions: { transcribeStyle: "clean" } },
            },
          },
        },
      }
    : {}

/** OpenRouter batch speech-to-text client using the configured model. */
export class Transcription extends Context.Service<
  Transcription,
  TranscriptionService
>()("cterm/openrouter/Transcription") {
  static readonly layer = Layer.effect(
    Transcription,
    Effect.gen(function* transcriptionLayer() {
      const credentials = yield* Credentials
      const config = yield* Config

      const apiKey = credentials.resolve(OPENROUTER_API_KEY_ENV).pipe(
        Effect.mapError(
          (cause) => new TranscriptionError({ cause, detail: cause.message })
        ),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new TranscriptionError({
                  cause: undefined,
                  detail:
                    "No OpenRouter API key found; run `cterm login` or set OPENROUTER_API_KEY",
                })
              ),
            onSome: Effect.succeed,
          })
        )
      )

      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(
          flow(
            HttpClientRequest.acceptJson,
            HttpClientRequest.setHeader("X-OpenRouter-Title", "cterm")
          )
        ),
        HttpClient.filterStatusOk,
        HttpClient.retryTransient({
          schedule: Schedule.exponential(100),
          times: 3,
        })
      )

      const transcribe = Effect.fn("Transcription.transcribe")(
        function* transcribe(input: TranscribeInput) {
          const key = yield* apiKey
          // Read per request so switching models applies without a restart.
          const model = yield* config.get.pipe(
            Effect.map((current) => current.transcriptionModel),
            Effect.mapError(
              (cause) => new TranscriptionError({ cause, detail: cause.detail })
            )
          )
          const recorded = formatFor(input.contentType)
          const { data, format } = needsOgg(model, recorded)
            ? {
                data: yield* remuxToOgg(input.data, recorded).pipe(
                  Effect.mapError(
                    (cause) =>
                      new TranscriptionError({ cause, detail: cause.message })
                  )
                ),
                format: "ogg",
              }
            : { data: input.data, format: recorded }
          const request = HttpClientRequest.post(
            OPENROUTER_TRANSCRIPTION_ENDPOINT
          ).pipe(
            HttpClientRequest.setHeader(
              "authorization",
              `Bearer ${Redacted.value(key)}`
            ),
            HttpClientRequest.bodyJsonUnsafe({
              input_audio: {
                data: Buffer.from(data).toString("base64"),
                format,
              },
              model,
              ...providerFor(model),
            })
          )

          return yield* client.execute(request).pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(TranscriptionResponseSchema)
            ),
            Effect.catch((error) =>
              describeFailure(error).pipe(
                Effect.flatMap((reason) =>
                  Effect.fail(
                    new TranscriptionError({
                      cause: error,
                      detail: `OpenRouter speech-to-text request failed (${format}, ${model}): ${reason}`,
                    })
                  )
                )
              )
            )
          )
        }
      )

      return Transcription.of({ transcribe })
    })
  )
}
