import { Context, Effect, Layer, Option, Schema } from "effect"

import {
  Credentials,
  OPENROUTER_API_KEY_ENV,
} from "../credentials/credentials.ts"
import { commandCatalogue } from "../models/models.ts"
import { ModelsStore } from "../models/store.ts"
import { choice } from "../typesafe/choice.ts"
import { defaultModel, systemOne } from "../typesafe/client.ts"
import type { Answer } from "../typesafe/client.ts"
import { commands } from "./commands.ts"
import type { Command } from "./commands.ts"

/**
 * Voice command selection. The supported commands plus a `none` option are the
 * only choices given to jev, so its answer is either one we can run or an
 * explicit `none`. This is the voice-driven counterpart to running a command
 * directly from the Commands page.
 */

export const VOICE_COMMAND_QUESTION_ID = "voiceCommand"

/** Sentinel option jev picks when the transcript matches no supported command. */
export const VOICE_COMMAND_NONE_ID = "none"

const VOICE_COMMAND_INSTRUCTIONS = `Pick the single supported command that best matches what the user asked for.
Choose the closest command even when the wording differs, and prefer the specific
command over a general one. If the request does not match any supported command,
answer with "${VOICE_COMMAND_NONE_ID}". Always answer with exactly one of the
provided ids.`

/**
 * Keep the interactive picker responsive: one retry and five seconds per
 * attempt, rather than the client's longer defaults.
 */
const VOICE_COMMAND_RETRIES = 1
const VOICE_COMMAND_TIMEOUT_MS = 5000

/** Raised when a spoken request cannot be turned into a supported command. */
export class VoiceCommandSelectionError extends Schema.TaggedError<VoiceCommandSelectionError>()(
  "VoiceCommandSelectionError",
  {
    cause: Schema.Defect(),
    detail: Schema.String,
  }
) {
  get message(): string {
    return this.detail
  }
}

/** Option descriptions handed to jev, keyed by command id (plus the none option). */
export const voiceCommandCriteria = (catalogue: readonly Command[]) => {
  const entries: (readonly [string, string])[] = [
    ...catalogue.map((command): readonly [string, string] => [
      command.id,
      `${command.label}: ${command.description}`,
    ]),
    [
      VOICE_COMMAND_NONE_ID,
      "None: use this when the request matches no supported command.",
    ],
  ]

  return Object.fromEntries(entries)
}

/** Resolve a jev answer back to a command from the catalogue. */
export const voiceCommandForChoice = (
  catalogue: readonly Command[],
  answer: Answer | undefined
): Command | undefined => {
  if (
    answer === undefined ||
    answer.type !== "choice" ||
    answer.choice === VOICE_COMMAND_NONE_ID
  ) {
    return undefined
  }
  return catalogue.find((command) => command.id === answer.choice)
}

/** Ask jev which supported command a spoken transcript describes. */
export const selectVoiceCommand = Effect.fn("selectVoiceCommand")(
  function* selectVoiceCommand(
    transcript: string,
    catalogue: readonly Command[] = commands
  ) {
    const credentials = yield* Credentials
    const apiKey = yield* credentials.resolve(OPENROUTER_API_KEY_ENV).pipe(
      Effect.mapError(
        (cause) =>
          new VoiceCommandSelectionError({ cause, detail: cause.message })
      ),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new VoiceCommandSelectionError({
                cause: undefined,
                detail:
                  "No OpenRouter API key found; run `cterm login` or set OPENROUTER_API_KEY",
              })
            ),
          onSome: Effect.succeed,
        })
      )
    )

    const response = yield* systemOne(
      {
        model: defaultModel,
        questions: {
          [VOICE_COMMAND_QUESTION_ID]: choice(
            VOICE_COMMAND_INSTRUCTIONS,
            voiceCommandCriteria(catalogue)
          ),
        },
        state: `The user said: "${transcript}"`,
      },
      {
        apiKey,
        retries: VOICE_COMMAND_RETRIES,
        timeoutMs: VOICE_COMMAND_TIMEOUT_MS,
      }
    ).pipe(
      Effect.mapError(
        (cause) =>
          new VoiceCommandSelectionError({ cause, detail: cause.message })
      )
    )

    const command = voiceCommandForChoice(
      catalogue,
      response.answers[VOICE_COMMAND_QUESTION_ID]
    )

    return Option.fromUndefinedOr(command)
  }
)

export interface VoiceCommandSelectorService {
  readonly select: (
    transcript: string
  ) => Effect.Effect<Option.Option<Command>, VoiceCommandSelectionError>
}

/** Resolves a spoken transcript to a supported command. */
export class VoiceCommandSelector extends Context.Service<
  VoiceCommandSelector,
  VoiceCommandSelectorService
>()("cterm/commands/VoiceCommandSelector") {
  static readonly layer = Layer.effect(
    VoiceCommandSelector,
    Effect.gen(function* voiceCommandSelectorLayer() {
      const credentials = yield* Credentials
      const models = yield* ModelsStore
      return VoiceCommandSelector.of({
        select: (transcript) =>
          Effect.gen(function* selectWithVettedModels() {
            const vetted = yield* models.list().pipe(
              Effect.mapError(
                (cause) =>
                  new VoiceCommandSelectionError({
                    cause,
                    detail: cause.message,
                  })
              )
            )

            return yield* selectVoiceCommand(
              transcript,
              commandCatalogue(commands, vetted)
            ).pipe(Effect.provideService(Credentials, credentials))
          }),
      })
    })
  )
}
