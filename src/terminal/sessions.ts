import { Option, Schema } from "effect"

/** cterm always keeps this many terminal sessions available. */
export const terminalSessionCount = 4

/**
 * The session whose shell cterm owns directly instead of through tmux, to try
 * scrolling real history in the browser. It does not survive cterm restarts.
 */
export const ptySessionNumber = 4

/** Whether a slot's shell runs in tmux. */
export const usesTmux = (session: number): boolean =>
  session !== ptySessionNumber

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
