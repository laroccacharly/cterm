import { describe, expect, test } from "bun:test"

import { Schema } from "effect"
import { HttpServerResponse } from "effect/http"

import {
  CommandsResponseSchema,
  commands,
  commandsResponse,
  transcriptionModelCommands,
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

  test("flags only the speech-to-text model in use as active", () => {
    const active = transcriptionModelCommands("elevenlabs/scribe-v2")
      .filter((command) => command.active === true)
      .map(({ id }) => id)

    expect(active).toEqual(["stt:elevenlabs/scribe-v2"])
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

  test("serves scoped models alongside the static commands", async () => {
    const catalogue = commandCatalogue(commands, [
      { id: "openai-codex/gpt-5.6-sol", name: "gpt-5.6-sol" },
    ])
    const response = HttpServerResponse.toWeb(commandsHttpResponse(catalogue))
    const payload = decodeCommandsResponse(await response.json())

    expect(payload.commands).toEqual([...catalogue])
  })
})
