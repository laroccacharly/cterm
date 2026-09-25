import { describe, expect, test } from "bun:test"

import { choice } from "../../src/typesafe/choice.ts"

describe("choice", () => {
  test("builds a choice question from named options", () => {
    expect(choice("Which?", { a: "First", b: "Second" })).toEqual({
      type: "choice",
      instructions: "Which?",
      criteria: { a: "First", b: "Second" },
    })
  })
})
