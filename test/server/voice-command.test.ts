import { describe, expect, test } from "bun:test"

import { Effect, Option, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

import { commands } from "../../src/commands/commands.ts"
import type { VoiceCommandSelectorService } from "../../src/commands/voice-command.ts"
import { VoiceCommandSelectionError } from "../../src/commands/voice-command.ts"
import { voiceCommandResponse } from "../../src/server/voice-command.ts"

const fontIncrease = commands.find(({ id }) => id === "font-increase")
if (fontIncrease === undefined) {
  throw new Error("Expected the font-increase command in the catalogue")
}

const selectorFor = (command = fontIncrease): VoiceCommandSelectorService => ({
  select: () => Effect.succeed(Option.some(command)),
})

const noCommandSelector: VoiceCommandSelectorService = {
  select: () => Effect.succeed(Option.none()),
}

const failingSelector: VoiceCommandSelectorService = {
  select: () =>
    Effect.fail(
      new VoiceCommandSelectionError({
        cause: undefined,
        detail: "No supported command matched",
      })
    ),
}

const request = (body: string): Request =>
  new Request("http://localhost/voice-command", {
    body,
    headers: { "content-type": "application/json" },
    method: "POST",
  })

const call = async (
  body: string,
  selector: VoiceCommandSelectorService
): Promise<Response> =>
  await Effect.runPromise(
    voiceCommandResponse(
      HttpServerRequest.fromWeb(request(body)),
      selector
    ).pipe(Effect.map(HttpServerResponse.toWeb))
  )

const MessageSchema = Schema.Struct({ message: Schema.String })
const decodeMessage = Schema.decodeUnknownSync(MessageSchema)

describe("voiceCommandResponse", () => {
  test("returns the command jev selected", async () => {
    const response = await call(
      JSON.stringify({ transcript: "make the text bigger" }),
      selectorFor()
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ command: fontIncrease })
  })

  test("rejects a missing or empty transcript", async () => {
    const missing = await call("{}", selectorFor())
    const empty = await call(JSON.stringify({ transcript: "" }), selectorFor())

    expect(missing.status).toBe(400)
    expect(empty.status).toBe(400)
  })

  test("rejects a non-JSON body", async () => {
    const response = await call("not json", selectorFor())

    expect(response.status).toBe(400)
  })

  test("returns null when jev finds no matching command", async () => {
    const response = await call(
      JSON.stringify({ transcript: "do something impossible" }),
      noCommandSelector
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ command: null })
  })

  test("reports a failed selection", async () => {
    const response = await call(
      JSON.stringify({ transcript: "do something impossible" }),
      failingSelector
    )

    expect(response.status).toBe(422)
    expect(decodeMessage(await response.json()).message).toBe(
      "No supported command matched"
    )
  })
})
