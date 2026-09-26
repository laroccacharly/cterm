import { describe, expect, test } from "bun:test"

import { Schema } from "effect"
import { HttpServerResponse } from "effect/unstable/http"

import {
  CommandsResponseSchema,
  commands,
  commandsResponse,
} from "../../src/commands/commands.ts"
import { commandCatalogue } from "../../src/models/models.ts"
import { commandsHttpResponse } from "../../src/server/commands.ts"

const decodeCommandsResponse = Schema.decodeUnknownSync(CommandsResponseSchema)

describe("Commands endpoint", () => {
  test("serves the catalogue with a label and description per command", async () => {
    const response = HttpServerResponse.toWeb(commandsHttpResponse(commands))
    const payload = decodeCommandsResponse(await response.json())

    expect(response.status).toBe(200)
    expect(payload).toEqual(commandsResponse)
    for (const command of payload.commands) {
      expect(command.label).not.toBe("")
      expect(command.description).not.toBe("")
    }
  })

  test("gives every command a unique id", () => {
    const ids = commands.map(({ id }) => id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  test("submits every input command with a carriage return", () => {
    for (const { action } of commands) {
      if (action.type === "input") {
        expect(action.data.endsWith("\r")).toBe(true)
      }
    }
  })

  test("serves vetted models alongside the static commands", async () => {
    const catalogue = commandCatalogue(commands, [
      { aliases: ["sol"], id: "openai-codex/gpt-5.6-sol", name: "GPT-5.6 Sol" },
    ])
    const response = HttpServerResponse.toWeb(commandsHttpResponse(catalogue))
    const payload = decodeCommandsResponse(await response.json())

    expect(payload.commands).toEqual([...catalogue])
  })
})
