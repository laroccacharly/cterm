import { describe, expect, test } from "bun:test"

import { Schema } from "effect"

import { commands } from "../../src/commands/commands.ts"
import {
  commandCatalogue,
  modelCommand,
  modelCommandId,
  parseScopedModel,
  PiSettingsSchema,
  scopedModels,
} from "../../src/models/models.ts"

const decodeSettings = Schema.decodeUnknownSync(
  Schema.fromJsonString(PiSettingsSchema)
)

describe("PiSettingsSchema", () => {
  test("defaults a missing enabledModels and ignores other settings", () => {
    expect(decodeSettings('{"theme":"dark"}')).toEqual({ enabledModels: [] })
  })
})

describe("parseScopedModel", () => {
  test("names a model after its id without the provider", () => {
    expect(parseScopedModel("openai-codex/gpt-6.1-sol")).toEqual({
      id: "openai-codex/gpt-6.1-sol",
      name: "gpt-6.1-sol",
    })
  })

  test("drops a :thinking suffix from the id", () => {
    expect(
      parseScopedModel("openrouter/deepseek/deepseek-v4.1-flash:high")
    ).toEqual({
      id: "openrouter/deepseek/deepseek-v4.1-flash",
      name: "deepseek-v4.1-flash",
    })
  })

  test("keeps a colon that is not a thinking level", () => {
    expect(parseScopedModel("ollama/qwen3:8b")?.id).toBe("ollama/qwen3:8b")
  })

  test("skips globs and blank patterns", () => {
    expect(parseScopedModel("anthropic/*")).toBeUndefined()
    expect(parseScopedModel("  ")).toBeUndefined()
  })
})

describe("scopedModels", () => {
  test("keeps pi's order and drops patterns it cannot switch to", () => {
    const models = scopedModels({
      enabledModels: [
        "claude-bridge/claude-opus-5-5",
        "openai/*",
        "openai-codex/gpt-6.1-sol:low",
      ],
    })

    expect(models.map(({ id }) => id)).toEqual([
      "claude-bridge/claude-opus-5-5",
      "openai-codex/gpt-6.1-sol",
    ])
  })
})

describe("modelCommand", () => {
  const sol = { id: "openai-codex/gpt-5.6-sol", name: "gpt-5.6-sol" }

  test("types pi's /model slash command under a namespaced id", () => {
    const command = modelCommand(sol)

    expect(command.action).toEqual({
      data: "/model openai-codex/gpt-5.6-sol\r",
      type: "input",
    })
    expect(command.id).toBe(modelCommandId(sol.id))
    expect(commands.map(({ id }) => id)).not.toContain(command.id)
  })

  test("describes the model by name and id so voice can match it", () => {
    const { description, label } = modelCommand(sol)

    expect(label).toContain(sol.name)
    expect(description).toContain(sol.id)
  })
})

describe("commandCatalogue", () => {
  test("appends model commands after the static commands", () => {
    const catalogue = commandCatalogue(commands, [
      {
        id: "openrouter/deepseek/deepseek-v4.1-flash",
        name: "deepseek-v4.1-flash",
      },
    ])

    expect(catalogue.slice(0, commands.length)).toEqual([...commands])
    expect(catalogue.at(-1)?.id).toBe(
      "model:openrouter/deepseek/deepseek-v4.1-flash"
    )
  })
})
