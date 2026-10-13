import { describe, expect, test } from "bun:test"

import { Effect, Layer, Option, Predicate, Redacted, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import type { HttpClientRequest } from "effect/http"

import type { TranscriptionModel } from "../../src/api/transcription.ts"
import { Config, defaultConfig } from "../../src/config/config.ts"
import { Credentials } from "../../src/credentials/credentials.ts"
import {
  needsOgg,
  OPENROUTER_TRANSCRIPTION_ENDPOINT,
  Transcription,
} from "../../src/openrouter/transcription.ts"

const key = Redacted.make("test-api-key")
const credentialsLayer = Layer.succeed(
  Credentials,
  Credentials.of({
    fromEnv: () => Effect.succeed(Option.some(key)),
    load: () => Effect.succeed(Option.none<Redacted.Redacted>()),
    remove: () => Effect.succeed(true),
    resolve: () => Effect.succeed(Option.some(key)),
    save: () => Effect.void,
  })
)
const noCredentialsLayer = Layer.succeed(
  Credentials,
  Credentials.of({
    fromEnv: () => Effect.succeed(Option.none<Redacted.Redacted>()),
    load: () => Effect.succeed(Option.none<Redacted.Redacted>()),
    remove: () => Effect.succeed(false),
    resolve: () => Effect.succeed(Option.none<Redacted.Redacted>()),
    save: () => Effect.void,
  })
)

const configLayer = (transcriptionModel: TranscriptionModel) => {
  const current = { ...defaultConfig, transcriptionModel }
  return Layer.succeed(
    Config,
    Config.of({
      get: Effect.succeed(current),
      resolve: (field) => Effect.succeed(current[field]),
      update: () => Effect.succeed(current),
    })
  )
}

interface Captured {
  readonly request: HttpClientRequest.HttpClientRequest
  readonly url: URL
}

const fakeClientLayer = (requests: Captured[]) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.sync(() => {
        requests.push({ request, url })
        return HttpClientResponse.fromWeb(
          request,
          Response.json(
            { text: "hello world" },
            { headers: { "content-type": "application/json" } }
          )
        )
      })
    )
  )

const run = async <A, E>(
  effect: Effect.Effect<A, E, Transcription>,
  credentials = credentialsLayer,
  requests: Captured[] = [],
  model: TranscriptionModel = defaultConfig.transcriptionModel
) =>
  await Effect.runPromise(
    effect.pipe(
      Effect.provide(Transcription.layer),
      Effect.provide(configLayer(model)),
      Effect.provide(credentials),
      Effect.provide(fakeClientLayer(requests))
    )
  )

const data = Uint8Array.from([1, 2, 3]).buffer
const oggAudio = { contentType: "audio/ogg", data }
const webmAudio = { contentType: "audio/webm;codecs=opus", data }

const RequestBodySchema = Schema.Struct({
  input_audio: Schema.Struct({ data: Schema.String, format: Schema.String }),
  model: Schema.String,
  provider: Schema.optional(
    Schema.Struct({
      options: Schema.Struct({
        azure: Schema.Struct({
          enhancedMode: Schema.Struct({
            modelOptions: Schema.Struct({ transcribeStyle: Schema.String }),
          }),
        }),
      }),
    })
  ),
})

const transcribeWith = async (
  model: TranscriptionModel,
  audio: typeof oggAudio
) => {
  const requests: Captured[] = []
  const result = await run(
    Effect.gen(function* transcribe() {
      const transcription = yield* Transcription
      return yield* transcription.transcribe(audio)
    }),
    credentialsLayer,
    requests,
    model
  )
  const [captured] = requests
  if (captured === undefined) {
    throw new Error("Expected a transcription request")
  }
  const { body } = captured.request
  if (!Predicate.isTagged(body, "Uint8Array")) {
    throw new Error("Expected a JSON request body")
  }
  const requestBody = Schema.decodeUnknownSync(
    Schema.fromJsonString(RequestBodySchema)
  )(new TextDecoder().decode(body.body))
  return { captured, requestBody, result }
}

describe("Transcription", () => {
  test("sends audio to the MAI-Transcribe model through OpenRouter", async () => {
    const { captured, requestBody, result } = await transcribeWith(
      "microsoft/mai-transcribe-2",
      oggAudio
    )

    expect(result.text).toBe("hello world")
    expect(captured.url.href).toBe(OPENROUTER_TRANSCRIPTION_ENDPOINT)
    expect(captured.request.headers.authorization).toBe("Bearer test-api-key")
    expect(captured.request.headers["x-openrouter-title"]).toBe("cterm")
    expect(requestBody.model).toBe("microsoft/mai-transcribe-2")
    expect(requestBody.input_audio).toEqual({ data: "AQID", format: "ogg" })
    expect(
      requestBody.provider?.options.azure.enhancedMode.modelOptions
        .transcribeStyle
    ).toBe("clean")
  })

  test("sends browser WebM to ElevenLabs Scribe as-is", async () => {
    const { requestBody } = await transcribeWith(
      "elevenlabs/scribe-v2",
      webmAudio
    )

    expect(requestBody.model).toBe("elevenlabs/scribe-v2")
    expect(requestBody.input_audio).toEqual({ data: "AQID", format: "webm" })
    expect(requestBody.provider).toBeUndefined()
  })

  test("converts only what Microsoft rejects", () => {
    expect(needsOgg("microsoft/mai-transcribe-2", "webm")).toBe(true)
    expect(needsOgg("microsoft/mai-transcribe-2", "mp4")).toBe(true)
    expect(needsOgg("microsoft/mai-transcribe-2", "ogg")).toBe(false)
    expect(needsOgg("elevenlabs/scribe-v2", "webm")).toBe(false)
    expect(needsOgg("elevenlabs/scribe-v2", "mp4")).toBe(false)
  })

  test("reports a missing OpenRouter API key", async () => {
    const error = await run(
      Effect.gen(function* transcribe() {
        const transcription = yield* Transcription
        return yield* transcription.transcribe(oggAudio).pipe(Effect.flip)
      }),
      noCredentialsLayer
    )

    expect(error.detail).toContain("OPENROUTER_API_KEY")
  })
})
