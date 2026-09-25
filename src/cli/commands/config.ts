import { Console, Effect, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"

import type { CtermConfig, CtermConfigPatch } from "../../config/config.ts"
import { Config } from "../../config/config.ts"
import { configPath } from "../../config/paths.ts"

const portFlag = Flag.integer("port").pipe(
  Flag.withAlias("p"),
  Flag.withDescription("Local HTTP port")
)

const tailscalePortFlag = Flag.integer("tailscale-port").pipe(
  Flag.withDescription("HTTPS port to publish cterm on over Tailscale")
)

const workingDirectoryFlag = Flag.string("working-directory").pipe(
  Flag.withAlias("d"),
  Flag.withDescription("Directory where the tmux shell starts")
)

const sessionNameFlag = Flag.string("session-name").pipe(
  Flag.withDescription("Persistent tmux session name")
)

const printConfig = Effect.fn("printConfig")(function* printConfig(
  config: CtermConfig
) {
  yield* Console.log(`port: ${config.port}`)
  yield* Console.log(`tailscalePort: ${config.tailscalePort}`)
  yield* Console.log(`workingDirectory: ${config.workingDirectory}`)
  yield* Console.log(`sessionName: ${config.sessionName}`)
})

const updateCommand = Command.make(
  "update",
  {
    port: Flag.optional(portFlag),
    sessionName: Flag.optional(sessionNameFlag),
    tailscalePort: Flag.optional(tailscalePortFlag),
    workingDirectory: Flag.optional(workingDirectoryFlag),
  },
  Effect.fn("configUpdateCommand")(function* configUpdateCommand(options) {
    const config = yield* Config
    const patch: CtermConfigPatch = {}

    if (Option.isSome(options.port)) {
      patch.port = options.port.value
    }
    if (Option.isSome(options.sessionName)) {
      patch.sessionName = options.sessionName.value
    }
    if (Option.isSome(options.tailscalePort)) {
      patch.tailscalePort = options.tailscalePort.value
    }
    if (Option.isSome(options.workingDirectory)) {
      patch.workingDirectory = options.workingDirectory.value
    }

    const next = yield* config.update(patch)

    yield* Console.log(`Updated ${configPath}`)
    yield* printConfig(next)
  })
).pipe(Command.withDescription("Update cterm's configuration"))

export const configCommand = Command.make(
  "config",
  {},
  Effect.fn("configCommand")(function* configCommand() {
    const config = yield* Config
    const current = yield* config.get()

    yield* Console.log(`path: ${configPath}`)
    yield* printConfig(current)
  })
).pipe(
  Command.withDescription("Show cterm's configuration"),
  Command.withSubcommands([updateCommand])
)
