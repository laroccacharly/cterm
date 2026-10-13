import { Schema } from "effect"

/** Successful response from `POST /transcribe`. */
export const TranscriptionResponseSchema = Schema.Struct({
  text: Schema.String,
})

export type TranscriptionResponse = typeof TranscriptionResponseSchema.Type

/** OpenRouter speech-to-text models cterm can switch between. */
export const transcriptionModels = [
  "microsoft/mai-transcribe-2",
  "elevenlabs/scribe-v2",
] as const

export const TranscriptionModelSchema = Schema.Literals(transcriptionModels)

export type TranscriptionModel = typeof TranscriptionModelSchema.Type

export const transcriptionModelNames: Record<TranscriptionModel, string> = {
  "elevenlabs/scribe-v2": "ElevenLabs Scribe v2",
  "microsoft/mai-transcribe-2": "Microsoft MAI-Transcribe 2",
}

/** Body of `POST /transcription-model` and its successful response. */
export const TranscriptionModelBodySchema = Schema.Struct({
  model: TranscriptionModelSchema,
})

export type TranscriptionModelBody = typeof TranscriptionModelBodySchema.Type
