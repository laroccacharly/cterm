import { Schema } from "effect"

/** Successful response from `POST /transcribe`. */
export const TranscriptionResponseSchema = Schema.Struct({
  text: Schema.String,
})

export type TranscriptionResponse = typeof TranscriptionResponseSchema.Type
