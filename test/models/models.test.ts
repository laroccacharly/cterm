import { describe, expect, test } from "bun:test"

import { Schema } from "effect"

import { commands } from "../../src/commands/commands.ts"
import {
  commandCatalogue,
  modelCommand,
  modelCommandId,
  ModelsFileSchema,
} from "../../src/models/models.ts"

const decodeModels = Schema.decodeUnknownSync(
  Schema.fromJsonString(ModelsFileSchema)
)

describe("ModelsFileSchema", () => {
  test("defaults missing fields", () => {
    expect(decodeModels("{}")).toEqual({ models: [] })
    expect(
      decodeModels(
        '{"models":[{"id":"openai-codex/gpt-5.6-sol","name":"Sol"}]}'
      )
    ).toEqual({
      models: [{ aliases: [], id: "openai-codex/gpt-5.6-sol", name: "Sol" }],
    })
  })

  test("keeps aliases and rejects empty ids", () => {
    const decoded = decodeModels(
      '{"models":[{"id":"openai-codex/gpt-6-astra","name":"Astra","aliases":["astra"],"thinkingLevel":"high"}]}'
    )
    expect(decoded.models[0]?.aliases).toEqual(["astra"])
    expect(decoded.models[0]?.thinkingLevel).toBe("high")
    expect(() => decodeModels('{"models":[{"id":"","name":"Bad"}]}')).toThrow()
  })

  test("rejects an unknown thinking level", () => {
    expect(() =>
      decodeModels(
        '{"models":[{"id":"openai-codex/gpt-6-astra","name":"Astra","thinkingLevel":"turbo"}]}'
      )
    ).toThrow()
  })
})

describe("modelCommand", () => {
  const sol = {
    aliases: ["sol", "the sun"],
    id: "openai-codex/gpt-5.6-sol",
    name: "GPT-5.6 Sol",
  }

  test("types pi's /model slash command under a namespaced id", () => {
    const command = modelCommand(sol)

    expect(command.action).toEqual({
      data: "/model openai-codex/gpt-5.6-sol\r",
      type: "input",
    })
    expect(command.id).toBe(modelCommandId(sol.id))
    expect(commands.map(({ id }) => id)).not.toContain(command.id)
  })

  test("describes the model by name and every alias so voice can match it", () => {
    const { description, label } = modelCommand(sol)

    expect(label).toContain(sol.name)
    for (const word of [sol.name, ...sol.aliases]) {
      expect(description).toContain(word)
    }
  })

  test("follows /model with /thinking when a level is pinned", () => {
    const command = modelCommand({ ...sol, thinkingLevel: "high" })

    expect(command.action).toEqual({
      data: "/model openai-codex/gpt-5.6-sol\r/thinking high\r",
      type: "input",
    })
    expect(command.description).toContain("high")
  })
})

describe("commandCatalogue", () => {
  test("appends model commands after the static commands", () => {
    const catalogue = commandCatalogue(commands, [
      {
        aliases: [],
        id: "openrouter/deepseek/deepseek-v4.1-flash",
        name: "DeepSeek V4.1 Flash",
      },
    ])

    expect(catalogue.slice(0, commands.length)).toEqual([...commands])
    expect(catalogue.at(-1)?.id).toBe(
      "model:openrouter/deepseek/deepseek-v4.1-flash"
    )
  })
})
