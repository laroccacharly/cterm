import { Console, Effect } from "effect"
import { CliError, Command } from "effect/unstable/cli"

import { piSettingsPath } from "../../config/paths.ts"
import { ModelsStore } from "../../models/store.ts"
import type { ModelsError } from "../../models/store.ts"

const userError = (error: ModelsError): CliError.CliError =>
  new CliError.UserError({
    cause: error.cause,
    userMessage: error.detail,
  })

const listCommand = Command.make(
  "list",
  {},
  Effect.fn("modelListCommand")(function* modelListCommand() {
    const store = yield* ModelsStore
    const models = yield* store.list().pipe(Effect.mapError(userError))

    if (models.length === 0) {
      yield* Console.log(
        `No scoped models in ${piSettingsPath}. Pick some in pi with \`/scoped-models\`.`
      )
      return
    }

    for (const model of models) {
      yield* Console.log(model.id)
    }
  })
).pipe(Command.withDescription("List pi's scoped models"))

export const modelCommand = Command.make(
  "model",
  {},
  Effect.fn("modelCommand")(function* modelCommand() {
    yield* Console.log(
      `cterm uses pi's scoped models from ${piSettingsPath}. Edit them in pi with \`/scoped-models\`.`
    )
  })
).pipe(
  Command.withDescription("Show the pi scoped models jev can switch to"),
  Command.withSubcommands([listCommand])
)
