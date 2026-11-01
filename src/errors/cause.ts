/** The message of a thrown value, whether or not it is an Error. */
export const causeMessage = (cause: unknown): string => {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

/** A thrown value as an Error, wrapping anything that is not one. */
export const causeError = (cause: unknown): Error => {
  if (cause instanceof Error) {
    return cause
  }
  return new Error(String(cause))
}
