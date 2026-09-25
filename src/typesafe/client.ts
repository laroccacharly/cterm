import { Data, Duration, Effect, Redacted, Schedule, Schema } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http"

import { ChoiceAnswerSchema } from "./choice.ts"
import type { ChoiceAnswer, ChoiceQuestion } from "./choice.ts"
import { NoulAnswerSchema } from "./noul.ts"
import type { NoulAnswer, NoulQuestion } from "./noul.ts"
import { ScoreAnswerSchema } from "./score.ts"
import type { ScoreAnswer, ScoreQuestion } from "./score.ts"

export type { ChoiceAnswer, ChoiceQuestion } from "./choice.ts"
export type { NoulAnswer, NoulQuestion } from "./noul.ts"
export type { ScoreAnswer, ScoreQuestion } from "./score.ts"

/**
 * Minimal System One client. One request carries a state plus any number of
 * questions; the response returns one answer per question. cterm reaches the
 * `jev` model through OpenRouter's decisions API with the OpenRouter key
 * resolved by the caller (environment or OS keychain).
 */

export const endpoint = "https://openrouter.ai/api/alpha/decisions"
export const defaultModel = "jev-latest"

/** TypeSafe aliases (for example `jev-latest`) are namespaced on OpenRouter. */
export const openRouterModel = (model: string): string =>
  model.includes("/") ? model : `~typesafe/${model}`

export class TypesafeError extends Data.TaggedError("TypesafeError")<{
  readonly detail: string
  readonly cause?: unknown
}> {
  override get message(): string {
    if (!(this.cause instanceof Error)) {
      return this.detail
    }
    return `${this.detail}: ${this.cause.message}`
  }
}

/** Every System One primitive question type. */

export type Question = NoulQuestion | ScoreQuestion | ChoiceQuestion

/** Every System One primitive answer type. */
export type Answer = NoulAnswer | ScoreAnswer | ChoiceAnswer

export interface SystemOneRequest {
  readonly state: string
  readonly model: string
  readonly questions: Readonly<Record<string, Question>>
}

export interface SystemOneResponse {
  readonly model: string
  readonly answers: Readonly<Record<string, Answer>>
}

export interface TypesafeRequestOptions {
  readonly apiKey: Redacted.Redacted
  readonly model?: string
  readonly retries?: number
  readonly timeoutMs?: number
}

const ResponseSchema = Schema.Struct({
  model: Schema.String,
  answers: Schema.Record(
    Schema.String,
    Schema.Union([NoulAnswerSchema, ScoreAnswerSchema, ChoiceAnswerSchema])
  ),
})

const DEFAULT_RETRIES = 4
const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Delegate to the current `globalThis.fetch`. `FetchHttpClient.Fetch` caches
 * its default on first use, so routing through this indirection keeps test
 * mocks and runtime fetch swaps working.
 */
const liveFetch = async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
): Promise<Response> => await globalThis.fetch(input, init)

const requestFor = (
  body: SystemOneRequest,
  apiKey: Redacted.Redacted
): HttpClientRequest.HttpClientRequest =>
  HttpClientRequest.post(endpoint).pipe(
    HttpClientRequest.setHeader(
      "authorization",
      `Bearer ${Redacted.value(apiKey)}`
    ),
    HttpClientRequest.bodyJsonUnsafe({
      ...body,
      model: openRouterModel(body.model),
    })
  )

/** Ask jev one System One request and decode its answers. */
export const systemOne = Effect.fn("systemOne")(
  function* systemOne(body: SystemOneRequest, options: TypesafeRequestOptions) {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.transformResponse((effect) =>
        effect.pipe(
          Effect.timeout(
            Duration.millis(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
          )
        )
      ),
      HttpClient.retryTransient({
        schedule: Schedule.exponential(500),
        times: options.retries ?? DEFAULT_RETRIES,
      })
    )

    const response = yield* client
      .execute(requestFor(body, options.apiKey))
      .pipe(
        Effect.mapError(
          (cause) =>
            new TypesafeError({ detail: "TypeSafe request failed", cause })
        )
      )
    if (response.status < 200 || response.status >= 300) {
      const detail = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
      return yield* new TypesafeError({
        detail: `TypeSafe request failed (${response.status}): ${detail}`,
      })
    }

    return yield* HttpClientResponse.schemaBodyJson(ResponseSchema)(
      response
    ).pipe(
      Effect.mapError(
        (cause) =>
          new TypesafeError({ detail: "Unexpected TypeSafe response", cause })
      )
    )
  },
  Effect.provideService(FetchHttpClient.Fetch, liveFetch),
  Effect.provide(FetchHttpClient.layer)
)
