import { describe, expect, test } from "bun:test"

import { Effect, Option } from "effect"

import { commands } from "../../src/commands/commands.ts"
import {
  selectVoiceCommand,
  voiceCommandCriteria,
  voiceCommandForChoice,
  VOICE_COMMAND_NONE_ID,
} from "../../src/commands/voice-command.ts"
import { Credentials } from "../../src/credentials/credentials.ts"
import { commandCatalogue } from "../../src/models/models.ts"
import type { Answer } from "../../src/typesafe/client.ts"

const hasOpenRouterApiKey =
  process.env.OPENROUTER_API_KEY !== undefined &&
  process.env.OPENROUTER_API_KEY !== ""

describe("voiceCommandCriteria", () => {
  test("offers every command plus none, each with a description", () => {
    const criteria = voiceCommandCriteria(commands)

    expect(Object.keys(criteria)).toEqual([
      ...commands.map(({ id }) => id),
      VOICE_COMMAND_NONE_ID,
    ])
    for (const command of commands) {
      expect(criteria[command.id]).toContain(command.label)
      expect(criteria[command.id]).toContain(command.description)
    }
    expect(criteria[VOICE_COMMAND_NONE_ID]).not.toBe("")
  })
})

describe("voiceCommandForChoice", () => {
  test("resolves a matching choice to its command", () => {
    expect(
      voiceCommandForChoice(
        commands,
        Option.some({ choice: "new-session", type: "choice" })
      ).pipe(Option.map(({ id }) => id))
    ).toEqual(Option.some("new-session"))
  })

  test("rejects unknown choices and non-choice answers", () => {
    const rejected: readonly Option.Option<Answer>[] = [
      Option.some({ choice: "nope", type: "choice" }),
      Option.some({ choice: VOICE_COMMAND_NONE_ID, type: "choice" }),
      Option.some({ noul: 0.9, type: "noul" }),
      Option.none(),
    ]
    for (const answer of rejected) {
      expect(voiceCommandForChoice(commands, answer)).toEqual(Option.none())
    }
  })
})

describe.skipIf(!hasOpenRouterApiKey)(
  "selectVoiceCommand (live OpenRouter decisions API)",
  () => {
    test("picks the font command from a natural phrase", async () => {
      const command = await Effect.runPromise(
        selectVoiceCommand("the text is too small, make it bigger").pipe(
          Effect.provide(Credentials.layer)
        )
      )

      expect(Option.getOrThrow(command).id).toBe("font-increase")
    }, 120_000)

    test("picks the new-session command from a natural phrase", async () => {
      const command = await Effect.runPromise(
        selectVoiceCommand("can you open a fresh shell for me").pipe(
          Effect.provide(Credentials.layer)
        )
      )

      expect(Option.getOrThrow(command).id).toBe("new-session")
    }, 120_000)

    test("returns none for an unsupported request", async () => {
      const command = await Effect.runPromise(
        selectVoiceCommand("what is the weather in Paris tomorrow").pipe(
          Effect.provide(Credentials.layer)
        )
      )

      expect(Option.isNone(command)).toBe(true)
    }, 120_000)

    test("picks a scoped model command from a spoken model name", async () => {
      const catalogue = commandCatalogue(commands, [
        { id: "openai-codex/gpt-5.6-sol", name: "gpt-5.6-sol" },
      ])
      const command = await Effect.runPromise(
        selectVoiceCommand("switch me over to sol", catalogue).pipe(
          Effect.provide(Credentials.layer)
        )
      )

      expect(Option.getOrThrow(command).action).toEqual({
        data: "/model openai-codex/gpt-5.6-sol\r",
        type: "input",
      })
    }, 120_000)
  }
)
