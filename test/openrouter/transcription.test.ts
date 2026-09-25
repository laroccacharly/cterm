import { describe, expect, test } from "bun:test"

import { Effect, Layer, Option, Predicate, Redacted, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import type { HttpClientRequest } from "effect/unstable/http"

import { Credentials } from "../../src/credentials/credentials.ts"
import {
  OPENROUTER_TRANSCRIPTION_ENDPOINT,
  TRANSCRIPTION_MODEL,
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
  requests: Captured[] = []
) =>
  await Effect.runPromise(
    effect.pipe(
      Effect.provide(Transcription.layer),
      Effect.provide(credentials),
      Effect.provide(fakeClientLayer(requests))
    )
  )

const audio = {
  contentType: "audio/webm",
  data: Uint8Array.from([1, 2, 3]).buffer,
  filename: "recording.webm",
}

const RequestBodySchema = Schema.Struct({
  input_audio: Schema.Struct({ data: Schema.String, format: Schema.String }),
  model: Schema.String,
  provider: Schema.Struct({
    options: Schema.Struct({
      azure: Schema.Struct({
        enhancedMode: Schema.Struct({
          modelOptions: Schema.Struct({ transcribeStyle: Schema.String }),
        }),
      }),
    }),
  }),
})

describe("Transcription", () => {
  test("sends audio to the MAI-Transcribe model through OpenRouter", async () => {
    const requests: Captured[] = []
    const result = await run(
      Effect.gen(function* transcribe() {
        const transcription = yield* Transcription
        return yield* transcription.transcribe(audio)
      }),
      credentialsLayer,
      requests
    )

    expect(result.text).toBe("hello world")
    const [captured] = requests
    if (captured === undefined) {
      throw new Error("Expected a transcription request")
    }
    expect(captured.url.href).toBe(OPENROUTER_TRANSCRIPTION_ENDPOINT)
    expect(captured.request.headers.authorization).toBe("Bearer test-api-key")
    expect(captured.request.headers["x-openrouter-title"]).toBe("cterm")

    const { body } = captured.request
    if (!Predicate.isTagged(body, "Uint8Array")) {
      throw new Error("Expected a JSON request body")
    }
    const requestBody = Schema.decodeUnknownSync(
      Schema.fromJsonString(RequestBodySchema)
    )(new TextDecoder().decode(body.body))
    expect(requestBody.model).toBe(TRANSCRIPTION_MODEL)
    expect(requestBody.input_audio).toEqual({ data: "AQID", format: "webm" })
    expect(
      requestBody.provider.options.azure.enhancedMode.modelOptions
        .transcribeStyle
    ).toBe("clean")
  })

  test("reports a missing OpenRouter API key", async () => {
    const error = await run(
      Effect.gen(function* transcribe() {
        const transcription = yield* Transcription
        return yield* transcription.transcribe(audio).pipe(Effect.flip)
      }),
      noCredentialsLayer
    )

    expect(error.detail).toContain("OPENROUTER_API_KEY")
  })
})
