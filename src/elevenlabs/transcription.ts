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
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http"

import { TranscriptionResponseSchema } from "../api/transcription.ts"
import type { TranscriptionResponse } from "../api/transcription.ts"
import {
  Credentials,
  ELEVENLABS_API_KEY_ENV,
} from "../credentials/credentials.ts"

export const SCRIBE_MODEL_ID = "scribe_v2"

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

export interface TranscriptionService {
  readonly transcribe: (
    input: TranscribeInput
  ) => Effect.Effect<TranscriptionResponse, TranscriptionError>
}

/** ElevenLabs batch speech-to-text client. */
export class Transcription extends Context.Service<
  Transcription,
  TranscriptionService
>()("cterm/elevenlabs/Transcription") {
  static readonly layer = Layer.effect(
    Transcription,
    Effect.gen(function* transcriptionLayer() {
      const credentials = yield* Credentials

      const apiKey = credentials.resolve(ELEVENLABS_API_KEY_ENV).pipe(
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
                    "No ElevenLabs API key found; run `cterm login` or set ELEVENLABS_API_KEY",
                })
              ),
            onSome: Effect.succeed,
          })
        )
      )

      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(
          flow(
            HttpClientRequest.prependUrl("https://api.elevenlabs.io"),
            HttpClientRequest.acceptJson
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
          const file = new File([input.data], input.filename, {
            type: input.contentType,
          })
          const request = HttpClientRequest.post("/v1/speech-to-text").pipe(
            HttpClientRequest.setHeader("xi-api-key", Redacted.value(key)),
            HttpClientRequest.bodyFormDataRecord({
              file,
              model_id: SCRIBE_MODEL_ID,
            })
          )

          return yield* client.execute(request).pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(TranscriptionResponseSchema)
            ),
            Effect.mapError(
              (cause) =>
                new TranscriptionError({
                  cause,
                  detail: "ElevenLabs speech-to-text request failed",
                })
            )
          )
        }
      )

      return Transcription.of({ transcribe })
    })
  )
}
