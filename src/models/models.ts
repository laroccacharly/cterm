import { Effect, Schema } from "effect"

import type { Command } from "../commands/commands.ts"

/**
 * cterm's own list of vetted pi models. Each entry is exactly what pi's
 * `/model` slash command accepts, so switching a session is just typing
 * `/model <id>` into the terminal.
 */

export const MODEL_COMMAND_PREFIX = "model:"

/** Every reasoning level pi's `/thinking` command accepts. */
export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const

export const ThinkingLevelSchema = Schema.Literals(THINKING_LEVELS)

export type ThinkingLevel = typeof ThinkingLevelSchema.Type

/** A single model the user trusts, with the words they might say for it. */
export const VettedModelSchema = Schema.Struct({
  aliases: Schema.Array(Schema.String).pipe(
    Schema.withDecodingDefault(Effect.succeed([]))
  ),
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String.check(Schema.isMinLength(1)),
  thinkingLevel: Schema.optional(ThinkingLevelSchema),
})

export type VettedModel = typeof VettedModelSchema.Type

/** The shape of `${ctermConfigDir}/models.json`. */
export const ModelsFileSchema = Schema.Struct({
  models: Schema.Array(VettedModelSchema).pipe(
    Schema.withDecodingDefault(Effect.succeed([]))
  ),
})

export type ModelsFile = typeof ModelsFileSchema.Type

export const emptyModelsFile: ModelsFile = { models: [] }

/** Command id for a model, namespaced so it cannot collide with a normal command. */
export const modelCommandId = (id: string): string =>
  `${MODEL_COMMAND_PREFIX}${id}`

const aliasSentence = (aliases: readonly string[]): string =>
  aliases.length === 0 ? "" : ` Also called ${aliases.join(", ")}.`

const thinkingSentence = (level: ThinkingLevel | undefined): string =>
  level === undefined ? "" : ` Sets ${level} reasoning.`

/**
 * The keystrokes that switch to a model. When the model pins a reasoning
 * level we follow up with pi's `/thinking` command, since the interactive
 * `/model` command does not understand a `:level` suffix.
 */
const switchInput = (model: VettedModel): string =>
  model.thinkingLevel === undefined
    ? `/model ${model.id}\r`
    : `/model ${model.id}\r/thinking ${model.thinkingLevel}\r`

/**
 * A vetted model as an ordinary `input` command. jev and the Commands page
 * both see it like any other command; running it types pi's `/model` command.
 */
export const modelCommand = (model: VettedModel): Command => ({
  action: { data: switchInput(model), type: "input" },
  description: `Switch the current pi session to ${model.name}.${aliasSentence(
    model.aliases
  )}${thinkingSentence(model.thinkingLevel)}`,
  id: modelCommandId(model.id),
  label: `Use ${model.name}`,
})

/** Static commands plus one input command per vetted model. */
export const commandCatalogue = (
  base: readonly Command[],
  models: readonly VettedModel[]
): readonly Command[] => [...base, ...models.map(modelCommand)]
