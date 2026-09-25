import { Effect, Option, Schema } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import type { HttpServerRequest } from "effect/unstable/http"

import {
  maxVoiceCommandTranscriptLength,
  VoiceCommandRequestSchema,
} from "../api/voice-command.ts"
import type { VoiceCommandSelectorService } from "../commands/voice-command.ts"
import { jsonError } from "./http.ts"

const decodeRequest = Schema.decodeUnknownOption(VoiceCommandRequestSchema)

const fail = (
  status: number,
  message: string
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.fromWeb(jsonError(status, "voice_command_failed", message))

/** Turn one spoken transcript into a runnable command via jev. */
export const voiceCommandResponse = (
  request: HttpServerRequest.HttpServerRequest,
  selector: VoiceCommandSelectorService
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* voiceCommandResponseEffect() {
    const body = yield* Effect.option(request.json)
    if (Option.isNone(body)) {
      return fail(400, "Expected a JSON request body")
    }

    const decoded = decodeRequest(body.value)
    if (Option.isNone(decoded)) {
      return fail(
        400,
        `Expected a transcript between 1 and ${maxVoiceCommandTranscriptLength} characters`
      )
    }

    return yield* Effect.match(selector.select(decoded.value.transcript), {
      onFailure: (error) => fail(422, error.message),
      onSuccess: (command) =>
        HttpServerResponse.fromWeb(
          Response.json({ command: Option.getOrNull(command) })
        ),
    })
  })
