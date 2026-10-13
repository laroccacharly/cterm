import path from "node:path"

import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect"
import * as JsonStore from "effect-lib/json-store"

import {
  TranscriptionModelSchema,
  transcriptionModels,
} from "../api/transcription.ts"
import { configPath, home } from "./paths.ts"

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
  transcriptionModel: transcriptionModels[0],
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
  transcriptionModel: TranscriptionModelSchema.pipe(
    Schema.withDecodingDefault(Effect.succeed(defaultConfig.transcriptionModel))
  ),
  workingDirectory: WorkingDirectory.pipe(
    Schema.withDecodingDefault(Effect.succeed(defaultConfig.workingDirectory))
  ),
})

export type CtermConfig = typeof CtermConfigSchema.Type

/** Fields that `cterm config update` and the UI may patch. */
export type CtermConfigPatch = {
  -readonly [K in keyof CtermConfig]?: CtermConfig[K]
}

/** Raised when cterm's configuration cannot be read or written. */
export class ConfigError extends Schema.TaggedError<ConfigError>()(
  "ConfigError",
  {
    cause: Schema.Defect(),
    detail: Schema.String,
  }
) {}

const storeError = (error: JsonStore.JsonStoreError): ConfigError =>
  new ConfigError({ cause: error, detail: error.message })

const validate = Schema.decodeUnknownEffect(CtermConfigSchema)

export interface ConfigService {
  /** The saved configuration, or the defaults before anything was saved. */
  readonly get: Effect.Effect<CtermConfig, ConfigError>
  /** A command-line override, falling back to the saved value. */
  readonly resolve: <K extends keyof CtermConfig>(
    key: K,
    override: Option.Option<CtermConfig[K]>
  ) => Effect.Effect<CtermConfig[K], ConfigError>
  /** Merge a patch into the configuration and persist it. */
  readonly update: (
    patch: CtermConfigPatch
  ) => Effect.Effect<CtermConfig, ConfigError>
}

/**
 * cterm's configuration, the single source every command and the server
 * read. It is read on each access, so changes apply without a restart.
 */
export class Config extends Context.Service<Config, ConfigService>()(
  "cterm/config/Config"
) {
  /** Builds a config backed by a specific file (used by tests). */
  static layerAt(
    filePath: string
  ): Layer.Layer<Config, never, FileSystem.FileSystem> {
    return Layer.effect(
      Config,
      Effect.gen(function* configLayer() {
        const fs = yield* FileSystem.FileSystem
        const store = JsonStore.make(filePath, CtermConfigSchema)

        const get = store.load.pipe(
          Effect.map(Option.getOrElse((): CtermConfig => defaultConfig)),
          Effect.mapError(storeError),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.withSpan("Config.get")
        )

        const update = Effect.fn("Config.update")(function* update(
          patch: CtermConfigPatch
        ) {
          const next = yield* validate({ ...(yield* get), ...patch }).pipe(
            Effect.mapError(
              (cause) =>
                new ConfigError({ cause, detail: "validate configuration" })
            )
          )
          yield* store
            .save(next)
            .pipe(
              Effect.mapError(storeError),
              Effect.provideService(FileSystem.FileSystem, fs)
            )
          return next
        })

        const resolve = <K extends keyof CtermConfig>(
          key: K,
          override: Option.Option<CtermConfig[K]>
        ) =>
          Option.match(override, {
            onNone: () => get.pipe(Effect.map((current) => current[key])),
            onSome: Effect.succeed,
          })

        return Config.of({ get, resolve, update })
      })
    )
  }

  static readonly layer: Layer.Layer<Config, never, FileSystem.FileSystem> =
    Config.layerAt(configPath)
}
