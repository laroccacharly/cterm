import path from "node:path"

import { Context, Effect, FileSystem, Layer, Schema } from "effect"

import { modelsPath } from "../config/paths.ts"
import { emptyModelsFile, ModelsFileSchema } from "./models.ts"
import type { ModelsFile, ThinkingLevel, VettedModel } from "./models.ts"

/** Raised when cterm's vetted model list cannot be read or written. */
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

const decodeModels = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ModelsFileSchema)
)

const encodeModels = Schema.encodeUnknownEffect(
  Schema.fromJsonString(ModelsFileSchema)
)

const matches = (model: VettedModel, idOrAlias: string): boolean =>
  model.id === idOrAlias || model.aliases.includes(idOrAlias)

/** Fields that can be changed on an existing model, leaving the rest alone. */
export interface VettedModelPatch {
  readonly aliases?: readonly string[]
  readonly name?: string
  readonly thinkingLevel?: ThinkingLevel
}

export interface ModelsStoreService {
  /** Add or replace a model, keyed by its pi model id. */
  readonly add: (model: VettedModel) => Effect.Effect<VettedModel, ModelsError>
  /** Every vetted model, sorted by display name. */
  readonly list: () => Effect.Effect<readonly VettedModel[], ModelsError>
  /** Remove the model matching an id or alias. */
  readonly remove: (
    idOrAlias: string
  ) => Effect.Effect<VettedModel, ModelsError>
  /**
   * Update the model matching an id or alias, preserving any field the patch
   * leaves untouched. Creates the model when it does not exist yet, which
   * requires the patch to carry a name.
   */
  readonly update: (
    idOrAlias: string,
    patch: VettedModelPatch
  ) => Effect.Effect<VettedModel, ModelsError>
}

/** Reads and persists cterm's vetted pi model list. */
export class ModelsStore extends Context.Service<
  ModelsStore,
  ModelsStoreService
>()("cterm/models/ModelsStore") {
  /** Builds a store backed by a specific JSON file (used by tests). */
  static layerAt(
    filePath: string
  ): Layer.Layer<ModelsStore, never, FileSystem.FileSystem> {
    return Layer.effect(
      ModelsStore,
      Effect.gen(function* modelsStore() {
        const fs = yield* FileSystem.FileSystem
        const directory = path.dirname(filePath)

        const read = Effect.fn("ModelsStore.read")(function* read() {
          const exists = yield* fs
            .exists(filePath)
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ModelsError({ cause, detail: `check ${filePath}` })
              )
            )

          if (!exists) {
            return emptyModelsFile
          }

          const raw = yield* fs
            .readFileString(filePath)
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ModelsError({ cause, detail: `read ${filePath}` })
              )
            )

          return yield* decodeModels(raw).pipe(
            Effect.mapError(
              (cause) => new ModelsError({ cause, detail: `parse ${filePath}` })
            )
          )
        })

        const write = Effect.fn("ModelsStore.write")(function* write(
          file: ModelsFile
        ) {
          yield* fs
            .makeDirectory(directory, { recursive: true })
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ModelsError({ cause, detail: `create ${directory}` })
              )
            )

          const raw = yield* encodeModels(file).pipe(
            Effect.mapError(
              (cause) =>
                new ModelsError({ cause, detail: `encode ${filePath}` })
            )
          )

          yield* fs
            .writeFileString(filePath, `${raw}\n`)
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ModelsError({ cause, detail: `write ${filePath}` })
              )
            )
        })

        const list = Effect.fn("ModelsStore.list")(function* list() {
          const file = yield* read()
          return [...file.models].toSorted((left, right) =>
            left.name.localeCompare(right.name)
          )
        })

        const add = Effect.fn("ModelsStore.add")(function* add(
          model: VettedModel
        ) {
          const file = yield* read()
          const next = file.models.filter(
            (existing) => existing.id !== model.id
          )
          next.push(model)
          yield* write({ models: next })
          return model
        })

        const remove = Effect.fn("ModelsStore.remove")(function* remove(
          idOrAlias: string
        ) {
          const file = yield* read()
          const found = file.models.find((model) => matches(model, idOrAlias))

          if (found === undefined) {
            return yield* new ModelsError({
              cause: undefined,
              detail: `No vetted model matches "${idOrAlias}"`,
            })
          }

          yield* write({
            models: file.models.filter((model) => !matches(model, idOrAlias)),
          })
          return found
        })

        const update = Effect.fn("ModelsStore.update")(function* update(
          idOrAlias: string,
          patch: VettedModelPatch
        ) {
          const file = yield* read()
          const index = file.models.findIndex((model) =>
            matches(model, idOrAlias)
          )

          if (index === -1) {
            if (patch.name === undefined) {
              return yield* new ModelsError({
                cause: undefined,
                detail: `No vetted model matches "${idOrAlias}"; pass --name to create it`,
              })
            }

            const created: VettedModel =
              patch.thinkingLevel === undefined
                ? {
                    aliases: patch.aliases ?? [],
                    id: idOrAlias,
                    name: patch.name,
                  }
                : {
                    aliases: patch.aliases ?? [],
                    id: idOrAlias,
                    name: patch.name,
                    thinkingLevel: patch.thinkingLevel,
                  }

            yield* write({ models: [...file.models, created] })
            return created
          }

          const current = file.models[index]

          if (current === undefined) {
            return yield* new ModelsError({
              cause: undefined,
              detail: `No vetted model matches "${idOrAlias}"`,
            })
          }

          const thinkingLevel = patch.thinkingLevel ?? current.thinkingLevel
          const next: VettedModel =
            thinkingLevel === undefined
              ? {
                  aliases: patch.aliases ?? current.aliases,
                  id: current.id,
                  name: patch.name ?? current.name,
                }
              : {
                  aliases: patch.aliases ?? current.aliases,
                  id: current.id,
                  name: patch.name ?? current.name,
                  thinkingLevel,
                }

          const models = [...file.models]
          models[index] = next
          yield* write({ models })
          return next
        })

        return ModelsStore.of({ add, list, remove, update })
      })
    )
  }

  static readonly layer: Layer.Layer<
    ModelsStore,
    never,
    FileSystem.FileSystem
  > = ModelsStore.layerAt(modelsPath)
}
