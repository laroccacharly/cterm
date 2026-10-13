import { Effect, Option, Schema } from "effect"
import { HttpServerResponse } from "effect/http"
import type { HttpServerRequest } from "effect/http"

import { TranscriptionModelBodySchema } from "../api/transcription.ts"
import type { TranscriptionModelBody } from "../api/transcription.ts"
import type { ConfigService } from "../config/config.ts"
import { jsonError } from "./http.ts"

const decodeBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(TranscriptionModelBodySchema)
)

/** Persist the speech-to-text model; transcription reads it per request. */
export const transcriptionModelResponse = (
  request: HttpServerRequest.HttpServerRequest,
  config: ConfigService
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* transcriptionModelResponseEffect() {
    const body = yield* Effect.option(request.text)
    const decoded = body.pipe(Option.flatMap((text) => decodeBody(text)))
    if (Option.isNone(decoded)) {
      return HttpServerResponse.fromWeb(
        jsonError(400, "invalid_request", "Unknown speech-to-text model")
      )
    }

    return yield* Effect.match(
      config.update({ transcriptionModel: decoded.value.model }),
      {
        onFailure: (error) =>
          HttpServerResponse.fromWeb(
            jsonError(500, "config_failed", `Could not ${error.detail}`)
          ),
        onSuccess: (next) =>
          HttpServerResponse.fromWeb(
            Response.json({
              model: next.transcriptionModel,
            } satisfies TranscriptionModelBody)
          ),
      }
    )
  })
