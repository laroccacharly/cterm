import { Console, Effect } from "effect"
import { CliError, Command } from "effect/unstable/cli"

import {
  install,
  reinstall,
  status,
  unitName,
  uninstall,
} from "../../service/systemd.ts"

const installCommand = Command.make(
  "install",
  {},
  Effect.fn("serviceInstallCommand")(function* serviceInstallCommand() {
    yield* install()
  })
).pipe(
  Command.withDescription("Install and start the cterm systemd user service")
)

const statusCommand = Command.make(
  "status",
  {},
  Effect.fn("serviceStatusCommand")(function* serviceStatusCommand() {
    const { output, running } = yield* status()

    yield* Console.log(output)

    if (!running) {
      yield* new CliError.UserError({
        cause: new Error(output),
        userMessage: `${unitName} is not running`,
      })
    }
  })
).pipe(Command.withDescription("Show the cterm service status"))

const reinstallCommand = Command.make(
  "reinstall",
  {},
  Effect.fn("serviceReinstallCommand")(function* serviceReinstallCommand() {
    yield* reinstall()
  })
).pipe(
  Command.withDescription("Rewrite the unit file and restart the cterm service")
)

const uninstallCommand = Command.make(
  "uninstall",
  {},
  Effect.fn("serviceUninstallCommand")(function* serviceUninstallCommand() {
    yield* uninstall()
  })
).pipe(
  Command.withDescription("Stop and remove the cterm systemd user service")
)

export const serviceCommand = Command.make("service").pipe(
  Command.withDescription("Manage the cterm systemd user service"),
  Command.withSubcommands([
    installCommand,
    statusCommand,
    reinstallCommand,
    uninstallCommand,
  ])
)
