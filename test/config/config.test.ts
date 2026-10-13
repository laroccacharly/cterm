import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { BunServices } from "@effect/platform-bun"
import { Effect, Layer, Schema } from "effect"

import {
  Config,
  CtermConfigSchema,
  defaultConfig,
  defaultTailscalePort,
} from "../../src/config/config.ts"

const decodeConfig = Schema.decodeUnknownSync(
  Schema.fromJsonString(CtermConfigSchema)
)

describe("CtermConfigSchema", () => {
  test("defaults fields for older config files", () => {
    expect(decodeConfig('{"port":3111}')).toEqual({
      port: 3111,
      sessionName: defaultConfig.sessionName,
      tailscalePort: defaultTailscalePort,
      transcriptionModel: defaultConfig.transcriptionModel,
      workingDirectory: defaultConfig.workingDirectory,
    })
  })

  test("keeps explicit fields", () => {
    expect(
      decodeConfig(
        '{"port":3111,"sessionName":"work","tailscalePort":9000,"transcriptionModel":"elevenlabs/scribe-v2","workingDirectory":"/tmp"}'
      )
    ).toEqual({
      port: 3111,
      sessionName: "work",
      tailscalePort: 9000,
      transcriptionModel: "elevenlabs/scribe-v2",
      workingDirectory: "/tmp",
    })
  })

  test("rejects unsafe tmux session names and invalid ports", () => {
    expect(() =>
      decodeConfig(
        '{"port":0,"sessionName":"bad name","tailscalePort":9000,"workingDirectory":"/tmp"}'
      )
    ).toThrow()
  })
})

const directory = await mkdtemp(path.join(tmpdir(), "cterm-config-"))
const filePath = path.join(directory, "cterm", "config.json")
const withConfig = async <A, E>(effect: Effect.Effect<A, E, Config>) =>
  await Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Config.layerAt(filePath).pipe(Layer.provide(BunServices.layer))
      )
    )
  )

afterAll(async () => {
  await rm(directory, { force: true, recursive: true })
})

describe("Config", () => {
  test("reads the defaults before anything is saved", async () => {
    const current = await withConfig(
      Effect.gen(function* readConfig() {
        const config = yield* Config
        return yield* config.get
      })
    )

    expect(current).toEqual(defaultConfig)
  })

  test("persists a patch so the next read sees it", async () => {
    const current = await withConfig(
      Effect.gen(function* updateConfig() {
        const config = yield* Config
        yield* config.update({ transcriptionModel: "elevenlabs/scribe-v2" })
        return yield* config.get
      })
    )

    expect(current.transcriptionModel).toBe("elevenlabs/scribe-v2")
    expect(JSON.parse(await readFile(filePath, "utf-8"))).toEqual(current)
  })

  test("rejects a patch that breaks the schema", async () => {
    const error = await withConfig(
      Effect.gen(function* updateConfig() {
        const config = yield* Config
        return yield* config.update({ port: 0 }).pipe(Effect.flip)
      })
    )

    expect(error.detail).toBe("validate configuration")
  })
})
