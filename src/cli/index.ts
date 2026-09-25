#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import { FetchHttpClient } from "effect/unstable/http"

import { Config } from "../config/config.ts"
import { Credentials } from "../credentials/credentials.ts"
import { ModelsStore } from "../models/store.ts"
import { version } from "../version.ts"
import { configCommand } from "./commands/config.ts"
import { healthCheckCommand } from "./commands/health-check.ts"
import { loginCommand } from "./commands/login.ts"
import { logoutCommand } from "./commands/logout.ts"
import { modelCommand } from "./commands/model.ts"
import { serveCommand } from "./commands/serve.ts"
import { serviceCommand } from "./commands/service.ts"
import { qrCommand, tailscaleCommand } from "./commands/tailscale.ts"

const cterm = Command.make("cterm").pipe(
  Command.withDescription("A private web terminal for your tailnet"),
  Command.withSubcommands([
    serveCommand,
    serviceCommand,
    configCommand,
    healthCheckCommand,
    tailscaleCommand,
    qrCommand,
    loginCommand,
    logoutCommand,
    modelCommand,
  ])
)

const MainLive = Layer.mergeAll(
  BunServices.layer,
  Config.layer,
  Credentials.layer,
  ModelsStore.layer,
  FetchHttpClient.layer
).pipe(Layer.provide(BunServices.layer))

BunRuntime.runMain(
  Command.run(cterm, { version }).pipe(Effect.provide(MainLive))
)
