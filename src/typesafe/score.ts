import { Schema } from "effect"

/**
 * A Score rates content against an ordered spectrum of descriptive levels.
 * Use it when the answer is a position that can fall between two levels.
 */
export interface ScoreQuestion {
  readonly type: "score"
  readonly instructions: string
  /** Ordered level descriptions, from the low end to the high end (2 to 10). */
  readonly criteria: readonly string[]
}

/**
 * `score` is a position on the levels spectrum (0 to levels - 1) and can land
 * between two levels. `probabilities` is keyed by level position.
 */
export const ScoreAnswerSchema = Schema.Struct({
  type: Schema.Literal("score"),
  score: Schema.Number,
  probabilities: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  confidence: Schema.optional(Schema.Number),
})
export type ScoreAnswer = typeof ScoreAnswerSchema.Type

/** Build a Score question from a question and its ordered level descriptions. */
export const score = (
  instructions: string,
  criteria: readonly string[]
): ScoreQuestion => ({ type: "score", instructions, criteria })

/** Normalize a raw score to `0..1` across a set of levels. */
export const normalizeScore = (answer: ScoreAnswer, levels: number): number => {
  const maximum = levels - 1
  if (maximum <= 0) {
    return 0
  }
  return Math.min(Math.max(answer.score, 0), maximum) / maximum
}
