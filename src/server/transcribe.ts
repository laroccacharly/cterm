import { Effect, Option } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import type { HttpServerRequest } from "effect/unstable/http"

import type { TranscriptionResponse } from "../api/transcription.ts"
import type { TranscriptionService } from "../openrouter/transcription.ts"
import { remuxToOgg } from "../ffmpeg/ffmpeg.ts"
import { jsonError } from "./http.ts"

export const maxAudioBytes = 25 * 1024 * 1024

/** Maps a browser audio MIME type to the format sent to OpenRouter. */
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

/** Formats OpenRouter's speech-to-text providers accept as-is. */
const supportedFormats = new Set(["mp3", "ogg", "wav"])

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

    const extension = extensionFor(contentType)
    const converted = supportedFormats.has(extension)
      ? Effect.succeed({ contentType, data: audio.value, extension })
      : remuxToOgg(audio.value, extension).pipe(
          Effect.map((data) => ({
            contentType: "audio/ogg",
            data,
            extension: "ogg",
          }))
        )

    return yield* Effect.match(
      converted.pipe(
        Effect.flatMap((payload) =>
          transcription.transcribe({
            contentType: payload.contentType,
            data: payload.data,
            filename: `recording.${payload.extension}`,
          })
        )
      ),
      {
        onFailure: (error) => fail(502, error.message),
        onSuccess: (result) =>
          HttpServerResponse.fromWeb(
            Response.json({ text: result.text } satisfies TranscriptionResponse)
          ),
      }
    )
  })
