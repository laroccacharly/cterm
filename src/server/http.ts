/** A JSON error body shared by cterm's JSON endpoints. */
export const jsonError = (
  status: number,
  error: string,
  message: string
): Response => Response.json({ error, message }, { status })
