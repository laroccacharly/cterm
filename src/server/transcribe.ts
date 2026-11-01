import type { SttClient, SttClientError } from "@laroccacharly/stt-client"
import { Duration, Effect, Option } from "effect"
import { HttpServerResponse } from "effect/http"
import type { HttpServerRequest } from "effect/http"

import type { TranscriptionResponse } from "../api/transcription.ts"
import { jsonError } from "./http.ts"

/**
 * Sanity cap for browser recordings: a MediaRecorder clip is small, while the
 * stt service itself accepts much larger files.
 */
export const maxAudioBytes = 25 * 1024 * 1024

/** How long one transcription may take before cterm stops waiting for stt. */
export const transcribeTimeout = Duration.minutes(2)

/** A local model can take a while to load, so preparing waits much longer. */
export const prepareTimeout = Duration.minutes(10)

const fail = (
  status: number,
  message: string
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.fromWeb(jsonError(status, "transcription_failed", message))

const timedOutResponse = () => fail(504, "stt-server did not answer in time")

/** HTTP status for each stt client failure; its message already says what to do. */
const sttFailureStatus: Record<SttClientError["reason"], number> = {
  "invalid-response": 502,
  server: 502,
  timeout: 504,
  unreachable: 503,
}

/** Map an stt client failure onto the response the browser shows. */
const sttFailureResponse = (
  error: SttClientError
): HttpServerResponse.HttpServerResponse =>
  fail(sttFailureStatus[error.reason], error.message)

const sttClientErrorResponse = (error: SttClientError) =>
  Effect.succeed(sttFailureResponse(error))

/** Transcribe one raw MediaRecorder payload. */
export const transcribeResponse = (
  request: HttpServerRequest.HttpServerRequest,
  transcription: SttClient["Service"],
  timeout: Duration.Input = transcribeTimeout
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

    const transcript = yield* transcription
      .transcribe({ contentType, data: audio.value })
      .pipe(Effect.timeoutOption(timeout))
    if (Option.isNone(transcript)) {
      return timedOutResponse()
    }

    return HttpServerResponse.fromWeb(
      Response.json({ text: transcript.value } satisfies TranscriptionResponse)
    )
  }).pipe(Effect.catchTag("SttClientError", sttClientErrorResponse))

/** Load the local model while the user is still speaking. */
export const prepareResponse = (
  transcription: SttClient["Service"],
  timeout: Duration.Input = prepareTimeout
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* prepareResponseEffect() {
    const prepared = yield* transcription.prepare.pipe(
      Effect.timeoutOption(timeout)
    )
    if (Option.isNone(prepared)) {
      return timedOutResponse()
    }

    return HttpServerResponse.empty({ status: 204 })
  }).pipe(Effect.catchTag("SttClientError", sttClientErrorResponse))
