import { describe, expect, test } from "bun:test"

import { ConfigProvider, Effect, Option, Redacted } from "effect"

import {
  Credentials,
  OPENROUTER_API_KEY_ENV,
  secretNames,
} from "../../src/credentials/credentials.ts"

const provider = ConfigProvider.fromEnvRecord({
  ELEVENLABS_API_KEY: "eleven-key",
  OPENROUTER_API_KEY: "env-key",
})

const withCredentials = async <A, E>(
  effect: Effect.Effect<A, E, Credentials>
) =>
  await Effect.runPromise(
    effect.pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, provider),
      Effect.provide(Credentials.layer)
    )
  )

describe("credentials", () => {
  test("stores both the ElevenLabs and OpenRouter keys", () => {
    expect(secretNames).toEqual(["ELEVENLABS_API_KEY", "OPENROUTER_API_KEY"])
  })

  test("fromEnv reads the matching environment variable", async () => {
    const value = await withCredentials(
      Effect.gen(function* fromEnv() {
        const credentials = yield* Credentials
        return yield* credentials.fromEnv(OPENROUTER_API_KEY_ENV)
      })
    )

    expect(Option.isSome(value)).toBe(true)
    if (Option.isSome(value)) {
      expect(Redacted.value(value.value)).toBe("env-key")
    }
  })

  test("resolve prefers the environment over the keychain", async () => {
    const value = await withCredentials(
      Effect.gen(function* resolve() {
        const credentials = yield* Credentials
        return yield* credentials.resolve(OPENROUTER_API_KEY_ENV)
      })
    )

    expect(Option.isSome(value)).toBe(true)
    if (Option.isSome(value)) {
      expect(Redacted.value(value.value)).toBe("env-key")
    }
  })
})
