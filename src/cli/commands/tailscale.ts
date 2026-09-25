import { Console, Effect, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"

import { Config } from "../../config/config.ts"
import { checkHealth } from "../../health/health-check.ts"
import { render } from "../../qr/qr.ts"
import {
  publicUrl,
  reset,
  serve,
  serveStatus,
  status,
} from "../../tailscale/tailscale.ts"

const portFlag = Flag.integer("port").pipe(
  Flag.withAlias("p"),
  Flag.withDescription(
    "Local port the cterm server listens on (overrides config)"
  )
)

const tailscalePortFlag = Flag.integer("tailscale-port").pipe(
  Flag.withDescription(
    "HTTPS port to publish cterm on over Tailscale (overrides config)"
  )
)

const resolvePort = Effect.fn("resolvePort")(function* resolvePort(
  port: Option.Option<number>
) {
  const config = yield* Config
  return yield* config.resolve("port", port)
})

const resolveTailscalePort = Effect.fn("resolveTailscalePort")(
  function* resolveTailscalePort(port: Option.Option<number>) {
    const config = yield* Config
    return yield* config.resolve("tailscalePort", port)
  }
)

const printHealth = Effect.fn("printHealth")(function* printHealth(
  port: number
) {
  const checked = yield* checkHealth(port).pipe(Effect.option)

  if (Option.isNone(checked)) {
    yield* Console.log("cterm server: not healthy")
    return
  }

  const { health, url } = checked.value
  yield* Console.log(
    `cterm server: OK ${url} (${health.service}: ${health.status})`
  )
})

const printUrl = Effect.fn("printUrl")(function* printUrl(servePort: number) {
  const url = yield* publicUrl(servePort)
  yield* Console.log(`URL: ${url}`)
})

const installCommand = Command.make(
  "install",
  {
    port: Flag.optional(portFlag),
    tailscalePort: Flag.optional(tailscalePortFlag),
  },
  Effect.fn("tailscaleInstallCommand")(function* tailscaleInstallCommand({
    port,
    tailscalePort,
  }) {
    const resolved = yield* resolvePort(port)
    const resolvedServePort = yield* resolveTailscalePort(tailscalePort)

    yield* serve(resolved, resolvedServePort)
    yield* Console.log(
      `Serving cterm on the tailnet on https port ${resolvedServePort} (local port ${resolved})`
    )

    yield* printHealth(resolved)
    yield* printUrl(resolvedServePort)
  })
).pipe(Command.withDescription("Serve cterm over Tailscale and print its URL"))

const statusCommand = Command.make(
  "status",
  {
    port: Flag.optional(portFlag),
    tailscalePort: Flag.optional(tailscalePortFlag),
  },
  Effect.fn("tailscaleStatusCommand")(function* tailscaleStatusCommand({
    port,
    tailscalePort,
  }) {
    const resolved = yield* resolvePort(port)
    const resolvedServePort = yield* resolveTailscalePort(tailscalePort)

    yield* Console.log("Tailscale status:")
    yield* Console.log((yield* status()).trim())

    const serveConfig = (yield* serveStatus()).trim()
    yield* Console.log("Tailscale serve configuration:")
    yield* Console.log(serveConfig === "" ? "  (none)" : serveConfig)

    yield* printHealth(resolved)
    yield* printUrl(resolvedServePort)
  })
).pipe(Command.withDescription("Show Tailscale status, cterm health, and URL"))

export const qrCommand = Command.make(
  "qr",
  { tailscalePort: Flag.optional(tailscalePortFlag) },
  Effect.fn("tailscaleQrCommand")(function* tailscaleQrCommand({
    tailscalePort,
  }) {
    const resolvedServePort = yield* resolveTailscalePort(tailscalePort)
    const url = yield* publicUrl(resolvedServePort)

    yield* Console.log(`URL: ${url}`)
    yield* Console.log(yield* render(url))
  })
).pipe(Command.withDescription("Print a QR code for the cterm Tailscale URL"))

const uninstallCommand = Command.make(
  "uninstall",
  { tailscalePort: Flag.optional(tailscalePortFlag) },
  Effect.fn("tailscaleUninstallCommand")(function* tailscaleUninstallCommand({
    tailscalePort,
  }) {
    const resolvedServePort = yield* resolveTailscalePort(tailscalePort)
    yield* reset(resolvedServePort)
    yield* Console.log(
      `Stopped serving cterm over Tailscale on https port ${resolvedServePort}`
    )
  })
).pipe(Command.withDescription("Stop serving cterm over Tailscale"))

export const tailscaleCommand = Command.make("tailscale").pipe(
  Command.withDescription("Serve cterm over Tailscale"),
  Command.withSubcommands([
    installCommand,
    statusCommand,
    qrCommand,
    uninstallCommand,
  ])
)
