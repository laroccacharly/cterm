import { Console, Effect, Option } from "effect"
import { CliError, Command } from "effect/unstable/cli"

import { Credentials, secretNames } from "../../credentials/credentials.ts"

export const loginCommand = Command.make(
  "login",
  {},
  Effect.fn("loginCommand")(function* loginCommand() {
    const credentials = yield* Credentials
    const missing: string[] = []

    for (const name of secretNames) {
      const value = yield* credentials.fromEnv(name)
      if (Option.isNone(value)) {
        missing.push(name)
        continue
      }

      yield* credentials.save(name, value.value).pipe(
        Effect.mapError(
          (error) =>
            new CliError.UserError({
              cause: error.cause,
              userMessage: `Login failed for ${name}: ${error.detail}`,
            })
        )
      )
      yield* Console.log(`Stored ${name} in the OS keychain`)
    }

    if (missing.length > 0) {
      yield* new CliError.UserError({
        cause: new Error(`Not set: ${missing.join(", ")}`),
        userMessage: `Not set: ${missing.join(", ")}. Export them before running \`cterm login\`.`,
      })
    }
  })
).pipe(
  Command.withDescription(
    `Store ${secretNames.join(" and ")} from the environment in the OS keychain`
  ),
  Command.withExamples([
    {
      command: "cterm login",
      description: "Store every configured cterm secret in the OS keychain",
    },
    {
      command: "cpass run -- cterm login",
      description: "Store the secrets injected by cpass",
    },
  ])
)
