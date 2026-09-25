import { describe, expect, test } from "bun:test"

import {
  parseSessionNumber,
  sessionNameFor,
  terminalSessionCount,
} from "../../src/terminal/sessions.ts"

describe("terminal sessions", () => {
  test("names tmux sessions after the base name and slot", () => {
    expect(sessionNameFor("cterm", 1)).toBe("cterm-1")
    expect(sessionNameFor("cterm-e2e", terminalSessionCount)).toBe(
      "cterm-e2e-3"
    )
  })

  test("accepts the valid session slots", () => {
    for (let session = 1; session <= terminalSessionCount; session += 1) {
      expect(parseSessionNumber(String(session))).toBe(session)
    }
  })

  test("falls back to the first slot for missing or invalid input", () => {
    expect(parseSessionNumber(null)).toBe(1)
    expect(parseSessionNumber("0")).toBe(1)
    expect(parseSessionNumber(String(terminalSessionCount + 1))).toBe(1)
    expect(parseSessionNumber("2.5")).toBe(1)
    expect(parseSessionNumber("not-a-number")).toBe(1)
  })
})
