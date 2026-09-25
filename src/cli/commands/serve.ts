import { Effect, FileSystem, Layer, Option } from "effect"
import { CliError, Command, Flag } from "effect/unstable/cli"

import { Config } from "../../config/config.ts"
import { serverLayer } from "../../server/serve.ts"
import { buildUi } from "../../server/ui.ts"

const portFlag = Flag.integer("port").pipe(
  Flag.withAlias("p"),
  Flag.withDescription("Port to serve the UI on (overrides config)")
)

export const serveCommand = Command.make(
  "serve",
  { port: Flag.optional(portFlag) },
  Effect.fn("serveCommand")(function* serveCommand({ port }) {
    const configService = yield* Config
    const configured = yield* configService.get()
    const fs = yield* FileSystem.FileSystem
    const resolved = {
      ...configured,
      port: yield* configService.resolve("port", port),
    }

    const directoryInfo = yield* fs
      .stat(resolved.workingDirectory)
      .pipe(Effect.option)
    if (
      Option.isNone(directoryInfo) ||
      directoryInfo.value.type !== "Directory"
    ) {
      return yield* new CliError.UserError({
        cause: new Error(
          "Working directory does not exist or is not a directory"
        ),
        userMessage: `Invalid working directory: ${resolved.workingDirectory}`,
      })
    }

    yield* buildUi()
    yield* Effect.logInfo(
      `Serving cterm at http://127.0.0.1:${resolved.port} (${resolved.workingDirectory}, tmux session ${resolved.sessionName})`
    )
    return yield* Layer.launch(serverLayer(resolved))
  })
).pipe(Command.withDescription("Build the terminal UI and serve it"))
