import { Effect, Schema } from "effect"

import type { Command } from "../commands/commands.ts"

/**
 * pi's scoped models (`enabledModels` in its settings, edited with
 * `/scoped-models`). Each pattern is what pi's `/model` slash command
 * accepts, so switching a session is just typing `/model <id>` into the
 * terminal.
 */

export const MODEL_COMMAND_PREFIX = "model:"

/**
 * Suffixes pi allows on a scoped pattern to pin reasoning. cterm strips
 * them because the interactive `/model` command does not accept them;
 * reasoning has its own commands.
 */
const THINKING_SUFFIX = /:(?:off|minimal|low|medium|high|xhigh|max)$/u

/** A model from pi's scope. */
export interface ScopedModel {
  readonly id: string
  readonly name: string
}

/** The part of pi's `settings.json` cterm cares about. */
export const PiSettingsSchema = Schema.Struct({
  enabledModels: Schema.Array(Schema.String).pipe(
    Schema.withDecodingDefault(Effect.succeed([]))
  ),
})

export type PiSettings = typeof PiSettingsSchema.Type

/**
 * Turns one `enabledModels` pattern into a model. Glob patterns name a set
 * of models rather than one `/model` target, so they are skipped.
 */
export const parseScopedModel = (pattern: string): ScopedModel | undefined => {
  const trimmed = pattern.trim()

  if (trimmed.length === 0 || /[*?[]/u.test(trimmed)) {
    return undefined
  }

  const id = trimmed.replace(THINKING_SUFFIX, "")
  return { id, name: id.slice(id.lastIndexOf("/") + 1) }
}

/** Every switchable model in pi's scope, in pi's own order. */
export const scopedModels = (settings: PiSettings): readonly ScopedModel[] =>
  settings.enabledModels.flatMap((pattern) => {
    const model = parseScopedModel(pattern)
    return model === undefined ? [] : [model]
  })

/** Command id for a model, namespaced so it cannot collide with a normal command. */
export const modelCommandId = (id: string): string =>
  `${MODEL_COMMAND_PREFIX}${id}`

/**
 * A scoped model as an ordinary `input` command. jev and the Commands page
 * both see it like any other command; running it types pi's `/model` command.
 */
export const modelCommand = (model: ScopedModel): Command => ({
  action: { data: `/model ${model.id}\r`, type: "input" },
  description: `Switch the current pi session to ${model.name} (${model.id}).`,
  id: modelCommandId(model.id),
  label: `Use ${model.name}`,
})

/** Static commands plus one input command per scoped model. */
export const commandCatalogue = (
  base: readonly Command[],
  models: readonly ScopedModel[]
): readonly Command[] => [...base, ...models.map(modelCommand)]
