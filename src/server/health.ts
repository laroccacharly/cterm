import { Schema } from "effect"

/** Payload returned by the `/health` endpoint. */
export const HealthResponseSchema = Schema.Struct({
  service: Schema.Literal("cterm"),
  status: Schema.Literal("ok"),
})

export type HealthResponse = typeof HealthResponseSchema.Type

export const healthResponse: HealthResponse = {
  service: "cterm",
  status: "ok",
}
