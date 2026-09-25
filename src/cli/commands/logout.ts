import { Console, Effect } from "effect"
import { CliError, Command } from "effect/unstable/cli"

import { Credentials, secretNames } from "../../credentials/credentials.ts"

export const logoutCommand = Command.make(
  "logout",
  {},
  Effect.fn("logoutCommand")(function* logoutCommand() {
    const credentials = yield* Credentials

    for (const name of secretNames) {
      const removed = yield* credentials.remove(name).pipe(
        Effect.mapError(
          (error) =>
            new CliError.UserError({
              cause: error.cause,
              userMessage: `Logout failed for ${name}: ${error.detail}`,
            })
        )
      )
      yield* Console.log(
        removed
          ? `Removed ${name} from the OS keychain`
          : `No stored ${name} found`
      )
    }
  })
).pipe(
  Command.withDescription(
    "Remove every stored cterm secret from the OS keychain"
  ),
  Command.withExamples([
    {
      command: "cterm logout",
      description: "Forget the keychain-stored cterm secrets",
    },
  ])
)
