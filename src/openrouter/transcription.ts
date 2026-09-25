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
} from "effect/unstable/http"

import { TranscriptionResponseSchema } from "../api/transcription.ts"
import type { TranscriptionResponse } from "../api/transcription.ts"
import {
  Credentials,
  OPENROUTER_API_KEY_ENV,
} from "../credentials/credentials.ts"

export const TRANSCRIPTION_MODEL = "microsoft/mai-transcribe-2"
export const OPENROUTER_TRANSCRIPTION_ENDPOINT =
  "https://openrouter.ai/api/v1/audio/transcriptions"

export interface TranscribeInput {
  readonly data: ArrayBuffer
  readonly filename: string
  readonly contentType: string
}

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

/** OpenRouter batch speech-to-text client using MAI-Transcribe. */
export class Transcription extends Context.Service<
  Transcription,
  TranscriptionService
>()("cterm/openrouter/Transcription") {
  static readonly layer = Layer.effect(
    Transcription,
    Effect.gen(function* transcriptionLayer() {
      const credentials = yield* Credentials

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
          const format = input.filename.split(".").at(-1) ?? "webm"
          const request = HttpClientRequest.post(
            OPENROUTER_TRANSCRIPTION_ENDPOINT
          ).pipe(
            HttpClientRequest.setHeader(
              "authorization",
              `Bearer ${Redacted.value(key)}`
            ),
            HttpClientRequest.bodyJsonUnsafe({
              input_audio: {
                data: Buffer.from(input.data).toString("base64"),
                format,
              },
              model: TRANSCRIPTION_MODEL,
              provider: {
                options: {
                  azure: {
                    enhancedMode: {
                      modelOptions: { transcribeStyle: "clean" },
                    },
                  },
                },
              },
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
                      detail: `OpenRouter speech-to-text request failed (${format}, ${TRANSCRIPTION_MODEL}): ${reason}`,
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
