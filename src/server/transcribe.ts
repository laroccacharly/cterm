import { Effect, Option } from "effect"
import { HttpServerResponse } from "effect/http"
import type { HttpServerRequest } from "effect/http"

import type { TranscriptionResponse } from "../api/transcription.ts"
import type { TranscriptionService } from "../openrouter/transcription.ts"
import { jsonError } from "./http.ts"

export const maxAudioBytes = 25 * 1024 * 1024

const fail = (
  status: number,
  message: string
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.fromWeb(jsonError(status, "transcription_failed", message))

/** Transcribe one raw MediaRecorder payload. */
export const transcribeResponse = (
  request: HttpServerRequest.HttpServerRequest,
  transcription: TranscriptionService
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* transcribeResponseEffect() {
    const contentType = request.headers["content-type"] ?? "audio/webm"
    if (!contentType.toLowerCase().startsWith("audio/")) {
      return fail(415, "Expected an audio request body")
    }

    const declaredLength = Number(request.headers["content-length"] ?? "0")
    if (declaredLength > maxAudioBytes) {
      return fail(413, "Recording is too large")
    }

    const audio = yield* Effect.option(request.arrayBuffer)
    if (Option.isNone(audio)) {
      return fail(400, "Could not read the recording")
    }

    if (audio.value.byteLength === 0) {
      return fail(400, "The recording is empty")
    }
    if (audio.value.byteLength > maxAudioBytes) {
      return fail(413, "Recording is too large")
    }

    return yield* Effect.match(
      transcription.transcribe({ contentType, data: audio.value }),
      {
        onFailure: (error) => fail(502, error.message),
        onSuccess: (result) =>
          HttpServerResponse.fromWeb(
            Response.json({ text: result.text } satisfies TranscriptionResponse)
          ),
      }
    )
  })
