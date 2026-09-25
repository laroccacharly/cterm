import path from "node:path"

import { Effect, FileSystem, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { configHome } from "../config/paths.ts"
import { runProcess } from "../process/command.ts"

export const serviceName = "cterm"
export const unitName = `${serviceName}.service`

const repoRoot = path.resolve(import.meta.dir, "../..")
const cliEntry = path.join(repoRoot, "src", "cli", "index.ts")
const bunPath = process.execPath

export const unitPath = path.join(configHome, "systemd", "user", unitName)

/** Raised when the cterm systemd unit cannot be managed. */
export class ServiceError extends Schema.TaggedError<ServiceError>()(
  "ServiceError",
  {
    cause: Schema.Defect(),
    detail: Schema.String,
  }
) {}

/** Contents of the `cterm.service` unit file. */
export const unitContents = (): string =>
  `[Unit]
Description=cterm private tailnet web terminal
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${repoRoot}
ExecStart="${bunPath}" "${cliEntry}" serve
Restart=always
RestartSec=5
TimeoutStopSec=15

[Install]
WantedBy=default.target
`

const spawnSystemctl = (args: readonly string[]) => {
  const detail = `systemctl --user ${args.join(" ")}`
  return runProcess(
    ChildProcess.make("systemctl", ["--user", ...args]),
    (cause) => new ServiceError({ cause, detail })
  )
}

const systemctl = Effect.fn("systemctl")(function* systemctl(
  args: readonly string[]
) {
  const result = yield* spawnSystemctl(args)

  if (result.exitCode !== ChildProcessSpawner.ExitCode(0)) {
    yield* new ServiceError({
      cause: new Error(result.output),
      detail: `systemctl --user ${args.join(" ")} failed`,
    })
  }

  return result.output
})

const writeUnit = Effect.fn("writeUnit")(function* writeUnit() {
  const fs = yield* FileSystem.FileSystem
  const detail = `write ${unitPath}`

  yield* fs
    .makeDirectory(path.dirname(unitPath), { recursive: true })
    .pipe(Effect.mapError((cause) => new ServiceError({ cause, detail })))

  yield* fs
    .writeFileString(unitPath, unitContents())
    .pipe(Effect.mapError((cause) => new ServiceError({ cause, detail })))

  yield* Effect.logInfo(`Wrote ${unitPath}`)
})

/** Install the unit file, then enable and start the service. */
export const install = Effect.fn("install")(function* install() {
  yield* writeUnit()
  yield* systemctl(["daemon-reload"])
  yield* systemctl(["enable", "--now", unitName])
  yield* Effect.logInfo(`Installed and started ${unitName}`)
})

/** Stop, disable, and remove the unit file. */
export const uninstall = Effect.fn("uninstall")(function* uninstall() {
  const fs = yield* FileSystem.FileSystem
  const detail = `remove ${unitPath}`

  yield* spawnSystemctl(["disable", "--now", unitName]).pipe(Effect.ignore)

  yield* fs
    .remove(unitPath, { force: true })
    .pipe(Effect.mapError((cause) => new ServiceError({ cause, detail })))

  yield* systemctl(["daemon-reload"])
  yield* Effect.logInfo(`Uninstalled ${unitName}`)
})

/** Rewrite the unit file and restart the service. */
export const reinstall = Effect.fn("reinstall")(function* reinstall() {
  yield* uninstall().pipe(Effect.ignore)
  yield* install()
})

/** Print the current service status. */
export const status = Effect.fn("status")(function* status() {
  const result = yield* spawnSystemctl(["status", unitName, "--no-pager"])

  return {
    output: result.output,
    running: result.exitCode === ChildProcessSpawner.ExitCode(0),
  }
})
