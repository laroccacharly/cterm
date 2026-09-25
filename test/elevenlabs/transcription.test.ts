import { describe, expect, test } from "bun:test"

import { Effect, Layer, Option, Predicate, Redacted } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import type { HttpClientRequest } from "effect/unstable/http"

import { Credentials } from "../../src/credentials/credentials.ts"
import { Transcription } from "../../src/elevenlabs/transcription.ts"

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
  data: new ArrayBuffer(8),
  filename: "recording.webm",
}

describe("Transcription", () => {
  test("returns text and sends multipart audio to ElevenLabs", async () => {
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
    expect(requests).toHaveLength(1)
    const [captured] = requests
    if (captured === undefined) {
      throw new Error("Expected a transcription request")
    }
    expect(captured.url.href).toBe(
      "https://api.elevenlabs.io/v1/speech-to-text"
    )
    expect(captured.request.headers["xi-api-key"]).toBe("test-api-key")

    const { body } = captured.request
    if (!Predicate.isTagged(body, "FormData")) {
      throw new Error("Expected multipart form data")
    }
    expect(body.formData.get("model_id")).toBe("scribe_v2")
    expect(body.formData.get("file")).toBeInstanceOf(File)
  })

  test("reports a missing API key", async () => {
    const error = await run(
      Effect.gen(function* transcribe() {
        const transcription = yield* Transcription
        return yield* transcription.transcribe(audio).pipe(Effect.flip)
      }),
      noCredentialsLayer
    )

    expect(error.detail).toContain("cterm login")
  })
})
