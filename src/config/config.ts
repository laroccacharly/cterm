import path from "node:path"

import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect"

import { configPath, ctermConfigDir, home } from "./paths.ts"

export const defaultTailscalePort = 8444

const Port = Schema.Int.check(Schema.isBetween({ maximum: 65_535, minimum: 1 }))
const SessionName = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/u)
)
const WorkingDirectory = Schema.String.check(Schema.isMinLength(1))

export const defaultConfig = {
  port: 3001,
  sessionName: "cterm",
  tailscalePort: defaultTailscalePort,
  workingDirectory: path.join(home, "Work"),
} as const

/** cterm's persisted configuration, including backward-compatible defaults. */
export const CtermConfigSchema = Schema.Struct({
  port: Port,
  sessionName: SessionName.pipe(
    Schema.withDecodingDefault(Effect.succeed(defaultConfig.sessionName))
  ),
  tailscalePort: Port.pipe(
    Schema.withDecodingDefault(Effect.succeed(defaultTailscalePort))
  ),
  workingDirectory: WorkingDirectory.pipe(
    Schema.withDecodingDefault(Effect.succeed(defaultConfig.workingDirectory))
  ),
})

export type CtermConfig = typeof CtermConfigSchema.Type

/** Fields that `cterm config update` may patch. */
export interface CtermConfigPatch {
  port?: number
  sessionName?: string
  tailscalePort?: number
  workingDirectory?: string
}

/** Raised when cterm's configuration cannot be read or written. */
export class ConfigError extends Schema.TaggedError<ConfigError>()(
  "ConfigError",
  {
    cause: Schema.Defect(),
    detail: Schema.String,
  }
) {}

const decodeConfig = Schema.decodeUnknownEffect(
  Schema.fromJsonString(CtermConfigSchema)
)

const encodeConfig = Schema.encodeUnknownEffect(
  Schema.fromJsonString(CtermConfigSchema)
)

/** Reads and persists cterm's configuration. */
export class Config extends Context.Service<
  Config,
  {
    readonly get: () => Effect.Effect<CtermConfig, ConfigError>
    readonly resolve: <K extends keyof CtermConfig>(
      key: K,
      override: Option.Option<CtermConfig[K]>
    ) => Effect.Effect<CtermConfig[K], ConfigError>
    readonly update: (
      patch: CtermConfigPatch
    ) => Effect.Effect<CtermConfig, ConfigError>
  }
>()("cterm/config/Config") {
  static readonly layer = Layer.effect(
    Config,
    Effect.gen(function* configLayer() {
      const fs = yield* FileSystem.FileSystem

      const get = Effect.fn("Config.get")(function* get() {
        const exists = yield* fs
          .exists(configPath)
          .pipe(
            Effect.mapError(
              (cause) =>
                new ConfigError({ cause, detail: `read ${configPath}` })
            )
          )

        if (!exists) {
          return defaultConfig
        }

        const raw = yield* fs
          .readFileString(configPath)
          .pipe(
            Effect.mapError(
              (cause) =>
                new ConfigError({ cause, detail: `read ${configPath}` })
            )
          )

        return yield* decodeConfig(raw).pipe(
          Effect.mapError(
            (cause) => new ConfigError({ cause, detail: `parse ${configPath}` })
          )
        )
      })

      const update = Effect.fn("Config.update")(function* update(
        patch: CtermConfigPatch
      ) {
        const current = yield* get()
        const next = { ...current, ...patch }
        const validated = yield* Schema.decodeUnknownEffect(CtermConfigSchema)(
          next
        ).pipe(
          Effect.mapError(
            (cause) =>
              new ConfigError({ cause, detail: "validate configuration" })
          )
        )

        yield* fs
          .makeDirectory(ctermConfigDir, { recursive: true })
          .pipe(
            Effect.mapError(
              (cause) =>
                new ConfigError({ cause, detail: `create ${ctermConfigDir}` })
            )
          )

        const raw = yield* encodeConfig(validated).pipe(
          Effect.mapError(
            (cause) =>
              new ConfigError({ cause, detail: `encode ${configPath}` })
          )
        )

        yield* fs
          .writeFileString(configPath, `${raw}\n`)
          .pipe(
            Effect.mapError(
              (cause) =>
                new ConfigError({ cause, detail: `write ${configPath}` })
            )
          )

        return validated
      })

      const resolve = Effect.fn("Config.resolve")(function* resolve<
        K extends keyof CtermConfig,
      >(key: K, override: Option.Option<CtermConfig[K]>) {
        const current = yield* get()
        return Option.getOrElse(override, () => current[key])
      })

      return Config.of({ get, resolve, update })
    })
  )
}
