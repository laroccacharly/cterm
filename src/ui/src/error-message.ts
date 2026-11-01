import { Predicate } from "effect"

/** A thrown value's message, or `fallback` when it has none to show. */
export const errorMessage = (cause: unknown, fallback: string): string => {
  if (Predicate.isError(cause) && cause.message.length > 0) {
    return cause.message
  }
  return fallback
}
