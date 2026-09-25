import { Console, Effect, Option } from "effect"
import { Argument, CliError, Command, Flag } from "effect/unstable/cli"

import { modelsPath } from "../../config/paths.ts"
import { THINKING_LEVELS } from "../../models/models.ts"
import type { VettedModel } from "../../models/models.ts"
import { ModelsStore } from "../../models/store.ts"
import type { ModelsError, VettedModelPatch } from "../../models/store.ts"

const userError = (error: ModelsError): CliError.CliError =>
  new CliError.UserError({
    cause: error.cause,
    userMessage: error.detail,
  })

const idArgument = Argument.string("id").pipe(
  Argument.withDescription(
    "pi model id including its provider, e.g. openai-codex/gpt-5.6-sol"
  )
)

const idOrAliasArgument = Argument.string("id-or-alias").pipe(
  Argument.withDescription(
    "pi model id or one of its aliases, e.g. openai-codex/gpt-5.6-sol or sol"
  )
)

const nameFlag = Flag.string("name").pipe(
  Flag.withDescription("Display name shown to jev and the Commands page")
)

const aliasFlag = Flag.string("alias").pipe(
  Flag.atLeast(0),
  Flag.withDefault<readonly string[]>([]),
  Flag.withDescription("A word you might say for this model (repeatable)")
)

const thinkingFlag = Flag.choice("thinking", THINKING_LEVELS).pipe(
  Flag.withDescription(
    "Reasoning level to set after switching (pi /thinking) [optional]"
  )
)

const listCommand = Command.make(
  "list",
  {},
  Effect.fn("modelListCommand")(function* modelListCommand() {
    const store = yield* ModelsStore
    const models = yield* store.list().pipe(Effect.mapError(userError))

    if (models.length === 0) {
      yield* Console.log(
        `No vetted models in ${modelsPath}. Add one with \`cterm model add <id> --name <name>\`.
`
      )
      return
    }

    for (const model of models) {
      const aliases =
        model.aliases.length === 0 ? "" : ` [${model.aliases.join(", ")}]`
      const thinking =
        model.thinkingLevel === undefined
          ? ""
          : ` (thinking: ${model.thinkingLevel})`
      yield* Console.log(`${model.id}  ${model.name}${aliases}${thinking}`)
    }
  })
).pipe(Command.withDescription("List the vetted pi models"))

const addCommand = Command.make(
  "add",
  {
    alias: aliasFlag,
    id: idArgument,
    name: nameFlag,
    thinking: Flag.optional(thinkingFlag),
  },
  Effect.fn("modelAddCommand")(function* modelAddCommand({
    alias,
    id,
    name,
    thinking,
  }) {
    const store = yield* ModelsStore
    const model: VettedModel = Option.isSome(thinking)
      ? { aliases: [...alias], id, name, thinkingLevel: thinking.value }
      : { aliases: [...alias], id, name }

    yield* store.add(model).pipe(Effect.mapError(userError))

    yield* Console.log(`Added ${model.id} (${model.name}) to ${modelsPath}`)
  })
).pipe(
  Command.withDescription("Add or replace a vetted pi model"),
  Command.withExamples([
    {
      command:
        'cterm model add openai-codex/gpt-5.6-sol --name "GPT-5.6 Sol" --alias sol',
      description: "Teach cterm about a model and how it is spoken",
    },
    {
      command:
        'cterm model add openai-codex/gpt-6-astra --name "GPT-6 Astra" --alias astra --thinking high',
      description: "Pin a model to a reasoning level",
    },
  ])
)

const updateCommand = Command.make(
  "update",
  {
    alias: Flag.optional(Flag.string("alias").pipe(Flag.atLeast(1))),
    id: idOrAliasArgument,
    name: Flag.optional(nameFlag),
    thinking: Flag.optional(thinkingFlag),
  },
  Effect.fn("modelUpdateCommand")(function* modelUpdateCommand({
    alias,
    id,
    name,
    thinking,
  }) {
    const store = yield* ModelsStore
    const patch: {
      -readonly [K in keyof VettedModelPatch]: VettedModelPatch[K]
    } = {}

    if (Option.isSome(alias)) {
      patch.aliases = [...alias.value]
    }
    if (Option.isSome(name)) {
      patch.name = name.value
    }
    if (Option.isSome(thinking)) {
      patch.thinkingLevel = thinking.value
    }

    const updated = yield* store
      .update(id, patch)
      .pipe(Effect.mapError(userError))

    yield* Console.log(
      `Updated ${updated.id} (${updated.name}) in ${modelsPath}`
    )
  })
).pipe(
  Command.withDescription(
    "Update an existing vetted pi model, leaving omitted fields alone"
  ),
  Command.withAlias("upsert"),
  Command.withExamples([
    {
      command: "cterm model update sol --thinking low",
      description: "Change only the reasoning level of an existing model",
    },
    {
      command: 'cterm model update deepseek --name "DeepSeek V4.1 Flash"',
      description: "Rename a model without touching its aliases",
    },
  ])
)

const deleteCommand = Command.make(
  "delete",
  { id: idOrAliasArgument },
  Effect.fn("modelDeleteCommand")(function* modelDeleteCommand({ id }) {
    const store = yield* ModelsStore
    const removed = yield* store.remove(id).pipe(Effect.mapError(userError))

    yield* Console.log(
      `Removed ${removed.id} (${removed.name}) from ${modelsPath}`
    )
  })
).pipe(
  Command.withDescription("Remove a vetted pi model by id or alias"),
  Command.withAlias("remove")
)

export const modelCommand = Command.make(
  "model",
  {},
  Effect.fn("modelCommand")(function* modelCommand() {
    yield* Console.log(
      `Manage the vetted pi models in ${modelsPath} with add, list, update, or delete.`
    )
  })
).pipe(
  Command.withDescription("Manage the vetted pi models jev can switch to"),
  Command.withSubcommands([
    listCommand,
    addCommand,
    updateCommand,
    deleteCommand,
  ])
)
