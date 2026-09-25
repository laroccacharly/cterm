import { Effect, Option } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import type { HttpServerRequest } from "effect/unstable/http"

import type { TranscriptionResponse } from "../api/transcription.ts"
import type { TranscriptionService } from "../elevenlabs/transcription.ts"
import { jsonError } from "./http.ts"

export const maxAudioBytes = 25 * 1024 * 1024

/** Maps a browser audio MIME type to a filename extension ElevenLabs accepts. */
export const extensionFor = (contentType: string): string => {
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? ""

  switch (base) {
    case "audio/mp4": {
      return "mp4"
    }
    case "audio/mpeg": {
      return "mp3"
    }
    case "audio/ogg": {
      return "ogg"
    }
    case "audio/wav":
    case "audio/x-wav": {
      return "wav"
    }
    default: {
      return "webm"
    }
  }
}

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
      transcription.transcribe({
        contentType,
        data: audio.value,
        filename: `recording.${extensionFor(contentType)}`,
      }),
      {
        onFailure: (error) => fail(502, error.message),
        onSuccess: (result) =>
          HttpServerResponse.fromWeb(
            Response.json({ text: result.text } satisfies TranscriptionResponse)
          ),
      }
    )
  })
