import { Schema } from "effect"

/** Error body returned by cterm's JSON endpoints. */
export const ApiErrorSchema = Schema.Struct({
  error: Schema.optional(Schema.String),
  message: Schema.String,
})

/** Raised when a cterm API request fails. */
export class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  status: Schema.optional(Schema.Number),
}) {
  get detail(): string {
    return this.message
  }
}
