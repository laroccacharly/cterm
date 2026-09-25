import { Option, Schema } from "effect"

/** cterm always keeps this many terminal sessions available. */
export const terminalSessionCount = 3

const SessionNumber = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({ maximum: terminalSessionCount, minimum: 1 }))
)

const decodeSessionNumber = Schema.decodeUnknownOption(SessionNumber)

/**
 * Normalize the `session` query parameter to a valid 1-based slot. Missing or
 * invalid values fall back to the first session so the terminal always opens.
 */
export const parseSessionNumber = (value: string | null): number => {
  if (value === null) {
    return 1
  }
  return Option.getOrElse(decodeSessionNumber(value), () => 1)
}

/** tmux session name backing a 1-based slot, for example `cterm-2`. */
export const sessionNameFor = (base: string, session: number): string =>
  `${base}-${session}`
