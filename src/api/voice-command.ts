import { Schema } from "effect"

import { CommandSchema } from "../commands/commands.ts"

export const maxVoiceCommandTranscriptLength = 2000

/** Body accepted by `POST /voice-command`. */
export const VoiceCommandRequestSchema = Schema.Struct({
  transcript: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(maxVoiceCommandTranscriptLength)
  ),
})

export type VoiceCommandRequest = typeof VoiceCommandRequestSchema.Type

/** Successful response from `POST /voice-command`. */
export const VoiceCommandResponseSchema = Schema.Struct({
  command: Schema.NullOr(CommandSchema),
})

export type VoiceCommandResponse = typeof VoiceCommandResponseSchema.Type
