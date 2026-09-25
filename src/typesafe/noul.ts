import { Schema } from "effect"

/** Optional clarifications of what a yes and a no mean. */
export interface NoulCriteria {
  readonly true: string
  readonly false: string
}

/**
 * A Noul evaluates a single yes/no question and returns the probability that
 * the answer is yes.
 */
export interface NoulQuestion {
  readonly type: "noul"
  readonly instructions: string
  /** Clarify the boundary between yes and no when the question is subtle. */
  readonly criteria?: NoulCriteria
}

/** `noul` is the probability that the answer is yes, from 0 to 1. */
export const NoulAnswerSchema = Schema.Struct({
  type: Schema.Literal("noul"),
  noul: Schema.Number,
})
export type NoulAnswer = typeof NoulAnswerSchema.Type

/** Build a Noul question. Phrase it so a high probability means "yes". */
export const noul = (
  instructions: string,
  criteria?: NoulCriteria
): NoulQuestion =>
  criteria === undefined
    ? { type: "noul", instructions }
    : { type: "noul", instructions, criteria }

/** Threshold a Noul probability into a hard yes/no decision. */
export const noulToBoolean = (answer: NoulAnswer, threshold = 0.5): boolean =>
  answer.noul >= threshold
