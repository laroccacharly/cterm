import { HttpServerResponse } from "effect/unstable/http"

import type { Command } from "../commands/commands.ts"

/** Return the JSON catalogue that powers the Commands page. */
export const commandsHttpResponse = (
  catalogue: readonly Command[]
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe({ commands: [...catalogue] })
