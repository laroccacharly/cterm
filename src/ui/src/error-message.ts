import { Predicate } from "effect"

/** A thrown value's message, or `fallback` when it has none to show. */
export const errorMessage = (cause: unknown, fallback: string): string =>
  Predicate.isError(cause) && cause.message.length > 0
    ? cause.message
    : fallback
