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
  test("is an input command that types pi's /model slash command", () => {
    expect(
      modelCommand({
        aliases: ["sol"],
        id: "openai-codex/gpt-5.6-sol",
        name: "GPT-5.6 Sol",
      })
    ).toEqual({
      action: { data: "/model openai-codex/gpt-5.6-sol\r", type: "input" },
      description:
        "Switch the current pi session to GPT-5.6 Sol. Also called sol.",
      id: modelCommandId("openai-codex/gpt-5.6-sol"),
      label: "Use GPT-5.6 Sol",
    })
  })

  test("adds a /thinking command when a level is pinned", () => {
    expect(
      modelCommand({
        aliases: ["astra"],
        id: "openai-codex/gpt-6-astra",
        name: "GPT-6 Astra",
        thinkingLevel: "high",
      })
    ).toEqual({
      action: {
        data: "/model openai-codex/gpt-6-astra\r/thinking high\r",
        type: "input",
      },
      description:
        "Switch the current pi session to GPT-6 Astra. Also called astra. Sets high reasoning.",
      id: modelCommandId("openai-codex/gpt-6-astra"),
      label: "Use GPT-6 Astra",
    })
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
