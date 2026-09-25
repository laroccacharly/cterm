import { Schema } from "effect"

/**
 * The Choice primitive. A Choice selects one option from a fixed, unordered
 * set. Option names become the `choice` value and the keys of `probabilities`.
 */

/** Answer options as a map of option name to the description sent to the model. */
export type ChoiceCriteria = Readonly<Record<string, string>>

/** A Choice selects one option from a defined set. */
export interface ChoiceQuestion {
  readonly type: "choice"
  readonly instructions: string
  readonly criteria: ChoiceCriteria
}

/** `choice` is the selected option; `probabilities` is keyed by option name. */
export const ChoiceAnswerSchema = Schema.Struct({
  type: Schema.Literal("choice"),
  choice: Schema.String,
  probabilities: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  confidence: Schema.optional(Schema.Number),
})
export type ChoiceAnswer = typeof ChoiceAnswerSchema.Type

/** Build a Choice question from a question and its named, described options. */
export const choice = (
  instructions: string,
  criteria: ChoiceCriteria
): ChoiceQuestion => ({ type: "choice", instructions, criteria })
