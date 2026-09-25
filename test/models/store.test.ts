import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"

import { ModelsStore } from "../../src/models/store.ts"

type Store = ModelsStore

const directory = await mkdtemp(path.join(tmpdir(), "cterm-models-"))
const filePath = path.join(directory, "cterm", "models.json")
const TestLayer = ModelsStore.layerAt(filePath).pipe(
  Layer.provide(BunServices.layer)
)

const run = async <A, E>(effect: Effect.Effect<A, E, Store>): Promise<A> =>
  await Effect.runPromise(effect.pipe(Effect.provide(TestLayer)))

const sol = {
  aliases: ["sol"],
  id: "openai-codex/gpt-5.6-sol",
  name: "GPT-5.6 Sol",
}
const deepseek = {
  aliases: [],
  id: "openrouter/deepseek/deepseek-v4.1-flash",
  name: "DeepSeek V4.1 Flash",
}

afterAll(async () => {
  await rm(directory, { force: true, recursive: true })
})

describe("ModelsStore", () => {
  test("reads an empty list when the file is missing", async () => {
    const models = await run(
      Effect.gen(function* readEmpty() {
        const store = yield* ModelsStore
        return yield* store.list()
      })
    )

    expect(models).toEqual([])
  })

  test("adds, sorts, and upserts models", async () => {
    const models = await run(
      Effect.gen(function* addModels() {
        const store = yield* ModelsStore
        yield* store.add(sol)
        yield* store.add(deepseek)
        yield* store.add({ ...sol, aliases: ["sol", "the-sol"] })
        return yield* store.list()
      })
    )

    expect(models.map(({ id }) => id)).toEqual([
      "openrouter/deepseek/deepseek-v4.1-flash",
      "openai-codex/gpt-5.6-sol",
    ])
    expect(models[1]?.aliases).toEqual(["sol", "the-sol"])

    expect(await Bun.file(filePath).text()).toContain("deepseek-v4.1-flash")
  })

  test("removes a model by alias", async () => {
    const removed = await run(
      Effect.gen(function* removeByAlias() {
        const store = yield* ModelsStore
        const model = yield* store.remove("sol")
        return { model, remaining: yield* store.list() }
      })
    )

    expect(removed.model.id).toBe("openai-codex/gpt-5.6-sol")
    expect(removed.remaining.map(({ id }) => id)).toEqual([
      "openrouter/deepseek/deepseek-v4.1-flash",
    ])
  })

  test("fails when nothing matches", async () => {
    const result = await run(
      Effect.gen(function* removeUnknown() {
        const store = yield* ModelsStore
        return yield* Effect.result(store.remove("unknown"))
      })
    )

    expect(result._tag).toBe("Failure")
  })

  test("updates only the patched fields", async () => {
    const updated = await run(
      Effect.gen(function* updateThinking() {
        const store = yield* ModelsStore
        return yield* store.update("openrouter/deepseek/deepseek-v4.1-flash", {
          thinkingLevel: "high",
        })
      })
    )

    expect(updated).toEqual({
      aliases: [],
      id: "openrouter/deepseek/deepseek-v4.1-flash",
      name: "DeepSeek V4.1 Flash",
      thinkingLevel: "high",
    })
  })

  test("creates a model when the patch carries a name", async () => {
    const created = await run(
      Effect.gen(function* upsertNew() {
        const store = yield* ModelsStore
        return yield* store.update("openai-codex/gpt-6-astra", {
          aliases: ["astra"],
          name: "GPT-6 Astra",
          thinkingLevel: "high",
        })
      })
    )

    expect(created).toEqual({
      aliases: ["astra"],
      id: "openai-codex/gpt-6-astra",
      name: "GPT-6 Astra",
      thinkingLevel: "high",
    })
  })

  test("refuses to create without a name", async () => {
    const result = await run(
      Effect.gen(function* upsertUnnamed() {
        const store = yield* ModelsStore
        return yield* Effect.result(store.update("unknown/model", {}))
      })
    )

    expect(result._tag).toBe("Failure")
  })
})
