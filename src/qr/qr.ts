import { Effect, Schema } from "effect"
import QRCode from "qrcode"

/** Raised when a QR code cannot be rendered. */
export class QrError extends Schema.TaggedError<QrError>()("QrError", {
  cause: Schema.Defect(),
  detail: Schema.String,
}) {}

/** Render `text` as a QR code suitable for printing in a terminal. */
export const render = Effect.fn("Qr.render")(function* render(text: string) {
  return yield* Effect.tryPromise({
    try: async () =>
      await QRCode.toString(text, { type: "terminal", small: true }),
    catch: (cause) =>
      new QrError({ cause, detail: `render QR code for ${text}` }),
  })
})
