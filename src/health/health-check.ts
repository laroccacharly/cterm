import { Effect, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"

import { HealthResponseSchema } from "../server/health.ts"

/** Raised when the cterm server cannot be reached or reports a problem. */
export class HealthCheckError extends Schema.TaggedError<HealthCheckError>()(
  "HealthCheckError",
  {
    cause: Schema.Defect(),
    url: Schema.String,
  }
) {}

/** Fetch `/health` from a locally running cterm server. */
export const checkHealth = Effect.fn("checkHealth")(function* checkHealth(
  port: number
) {
  const url = `http://127.0.0.1:${port}/health`
  const client = yield* HttpClient.HttpClient

  const response = yield* client
    .get(url)
    .pipe(Effect.mapError((cause) => new HealthCheckError({ cause, url })))

  if (response.status !== 200) {
    return yield* new HealthCheckError({
      cause: new Error(`HTTP ${response.status}`),
      url,
    })
  }

  const health = yield* HttpClientResponse.schemaBodyJson(HealthResponseSchema)(
    response
  ).pipe(Effect.mapError((cause) => new HealthCheckError({ cause, url })))

  return { health, url }
})
