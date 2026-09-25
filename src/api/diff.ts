import { Schema } from "effect"

/** Successful response from `GET /diff`. */
export const DiffResponseSchema = Schema.Struct({
  patch: Schema.String,
  repository: Schema.String,
})

export type DiffResponse = typeof DiffResponseSchema.Type
