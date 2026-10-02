import { Context, Effect, FileSystem, Layer, Schema } from "effect"

import { piSettingsPath } from "../config/paths.ts"
import { PiSettingsSchema, scopedModels } from "./models.ts"
import type { ScopedModel } from "./models.ts"

/** Raised when pi's scoped model list cannot be read. */
export class ModelsError extends Schema.TaggedError<ModelsError>()(
  "ModelsError",
  {
    cause: Schema.Defect(),
    detail: Schema.String,
  }
) {
  get message(): string {
    return this.detail
  }
}

const decodeSettings = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PiSettingsSchema)
)

export interface ModelsStoreService {
  /** pi's scoped models, in the order pi cycles through them. */
  readonly list: () => Effect.Effect<readonly ScopedModel[], ModelsError>
}

/** Reads the scoped models from pi's own settings, so cterm keeps no copy. */
export class ModelsStore extends Context.Service<
  ModelsStore,
  ModelsStoreService
>()("cterm/models/ModelsStore") {
  /** Builds a store backed by a specific pi settings file (used by tests). */
  static layerAt(
    filePath: string
  ): Layer.Layer<ModelsStore, never, FileSystem.FileSystem> {
    return Layer.effect(
      ModelsStore,
      Effect.gen(function* modelsStore() {
        const fs = yield* FileSystem.FileSystem

        const list = Effect.fn("ModelsStore.list")(function* list() {
          const exists = yield* fs
            .exists(filePath)
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ModelsError({ cause, detail: `check ${filePath}` })
              )
            )

          if (!exists) {
            return []
          }

          const raw = yield* fs
            .readFileString(filePath)
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ModelsError({ cause, detail: `read ${filePath}` })
              )
            )

          const settings = yield* decodeSettings(raw).pipe(
            Effect.mapError(
              (cause) => new ModelsError({ cause, detail: `parse ${filePath}` })
            )
          )

          return scopedModels(settings)
        })

        return ModelsStore.of({ list })
      })
    )
  }

  static readonly layer: Layer.Layer<
    ModelsStore,
    never,
    FileSystem.FileSystem
  > = ModelsStore.layerAt(piSettingsPath)
}
