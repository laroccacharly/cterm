import { Schema } from "effect"
import type { Option } from "effect"

const PositiveDimension = Schema.Int.check(
  Schema.isBetween({ maximum: 1000, minimum: 1 })
)

export const ClientMessageSchema = Schema.Union([
  Schema.Struct({
    data: Schema.String,
    type: Schema.Literal("input"),
  }),
  Schema.Struct({
    cols: PositiveDimension,
    rows: PositiveDimension,
    type: Schema.Literal("resize"),
  }),
  Schema.Struct({
    type: Schema.Literal("reset"),
  }),
])

export type ClientMessage = typeof ClientMessageSchema.Type

const decodeClientMessage = Schema.decodeUnknownOption(
  Schema.fromJsonString(ClientMessageSchema)
)

/** Decode and validate a message received from an untrusted browser. */
export const parseClientMessage = (
  input: string
): Option.Option<ClientMessage> => decodeClientMessage(input)
