import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"

import { ModelsStore } from "../../src/models/store.ts"

const directory = await mkdtemp(path.join(tmpdir(), "cterm-models-"))
const filePath = path.join(directory, "settings.json")
const TestLayer = ModelsStore.layerAt(filePath).pipe(
  Layer.provide(BunServices.layer)
)

const list = async () =>
  await Effect.runPromise(
    Effect.gen(function* listModels() {
      const store = yield* ModelsStore
      return yield* store.list()
    }).pipe(Effect.provide(TestLayer))
  )

afterAll(async () => {
  await rm(directory, { force: true, recursive: true })
})

describe("ModelsStore", () => {
  test("reads an empty list when pi has no settings file", async () => {
    expect(await list()).toEqual([])
  })

  test("reads the scoped models from pi's enabledModels", async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        enabledModels: [
          "openai-codex/gpt-6.1-sol",
          "openrouter/z-ai/glm-5.3:high",
        ],
        theme: "dark",
      })
    )

    expect(await list()).toEqual([
      { id: "openai-codex/gpt-6.1-sol", name: "gpt-6.1-sol" },
      { id: "openrouter/z-ai/glm-5.3", name: "glm-5.3" },
    ])
  })

  test("fails with ModelsError on malformed settings", async () => {
    await writeFile(filePath, "{not json")

    const error = await Effect.runPromise(
      Effect.gen(function* listModels() {
        const store = yield* ModelsStore
        return yield* store.list()
      }).pipe(Effect.flip, Effect.provide(TestLayer))
    )

    expect(error._tag).toBe("ModelsError")
    expect(error.detail).toContain("parse")
  })
})
