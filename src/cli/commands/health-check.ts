import { Console, Effect } from "effect"
import { CliError, Command, Flag } from "effect/unstable/cli"

import { Config } from "../../config/config.ts"
import { checkHealth } from "../../health/health-check.ts"

const portFlag = Flag.integer("port").pipe(
  Flag.withAlias("p"),
  Flag.withDescription("Port to check (overrides config)")
)

export const healthCheckCommand = Command.make(
  "health-check",
  { port: Flag.optional(portFlag) },
  Effect.fn("healthCheckCommand")(function* healthCheckCommand({ port }) {
    const config = yield* Config
    const resolved = yield* config.resolve("port", port)

    const { health, url } = yield* checkHealth(resolved).pipe(
      Effect.mapError(
        (error) =>
          new CliError.UserError({
            cause: error.cause,
            userMessage: `Health check failed for ${error.url}`,
          })
      )
    )

    yield* Console.log(`OK ${url} (${health.service}: ${health.status})`)
  })
).pipe(Command.withDescription("Check that the cterm server is healthy"))
