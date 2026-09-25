import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import {
  ensureFfmpeg,
  ffmpegMissingMessage,
} from "../../src/ffmpeg/ffmpeg.ts"

describe("ensureFfmpeg", () => {
  test("fails with an actionable message when ffmpeg is missing", async () => {
    const error = await Effect.runPromise(
      ensureFfmpeg(() => null).pipe(Effect.flip)
    )
    expect(error.message).toBe(ffmpegMissingMessage)
  })

  test("succeeds when ffmpeg is on PATH", async () => {
    await Effect.runPromise(ensureFfmpeg(() => "/usr/bin/ffmpeg"))
  })
})
