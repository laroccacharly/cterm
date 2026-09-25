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
  test("returns every command with a label and description", async () => {
    const response = HttpServerResponse.toWeb(commandsHttpResponse(commands))
    const payload = decodeCommandsResponse(await response.json())

    expect(response.status).toBe(200)
    expect(payload).toEqual(commandsResponse)
    expect(payload.commands.map(({ id }) => id)).toEqual([
      "new-session",
      "font-increase",
      "font-decrease",
    ])
    for (const command of payload.commands) {
      expect(command.label).not.toBe("")
      expect(command.description).not.toBe("")
    }
  })

  test("merges vetted models into the catalogue", async () => {
    const catalogue = commandCatalogue(commands, [
      { aliases: ["sol"], id: "openai-codex/gpt-5.6-sol", name: "GPT-5.6 Sol" },
    ])
    const response = HttpServerResponse.toWeb(commandsHttpResponse(catalogue))
    const payload = decodeCommandsResponse(await response.json())

    expect(payload.commands).toHaveLength(commands.length + 1)
    expect(payload.commands.at(-1)).toEqual({
      action: { data: "/model openai-codex/gpt-5.6-sol\r", type: "input" },
      description:
        "Switch the current pi session to GPT-5.6 Sol. Also called sol.",
      id: "model:openai-codex/gpt-5.6-sol",
      label: "Use GPT-5.6 Sol",
    })
  })

  test("describes how the browser should execute each command", () => {
    expect(commandsResponse.commands).toEqual([
      {
        action: { data: "/new\r", type: "input" },
        description: "Start a fresh shell session in the current directory.",
        id: "new-session",
        label: "New session",
      },
      {
        action: { delta: 1, type: "font-size" },
        description: "Make the terminal text one step larger.",
        id: "font-increase",
        label: "Increase font size",
      },
      {
        action: { delta: -1, type: "font-size" },
        description: "Make the terminal text one step smaller.",
        id: "font-decrease",
        label: "Decrease font size",
      },
    ])
  })
})
