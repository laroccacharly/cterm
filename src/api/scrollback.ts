import { Schema } from "effect"

/** Successful response from `GET /scrollback`. */
export const ScrollbackResponseSchema = Schema.Struct({
  /** Pane history and visible screen, with colors, one line per row. */
  content: Schema.String,
  /**
   * The pane runs an app on the alternate screen or with mouse reporting, such
   * as vim or fullscreen pi, which scrolls itself; `content` is then empty.
   */
  fullScreenApp: Schema.Boolean,
})

export type ScrollbackResponse = typeof ScrollbackResponseSchema.Type
