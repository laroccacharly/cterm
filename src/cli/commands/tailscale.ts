import { Effect, Option } from "effect"
import { tailscaleCommand as makeTailscaleCommand } from "effect-lib/tailscale"

import { Config } from "../../config/config.ts"
import { checkHealth } from "../../health/health-check.ts"

const healthLine = (serverPort: number) =>
  checkHealth(serverPort).pipe(
    Effect.option,
    Effect.map(
      Option.match({
        onNone: () => "cterm server: not healthy",
        onSome: ({ health, url }) =>
          `cterm server: OK ${url} (${health.service}: ${health.status})`,
      })
    )
  )

/** `cterm tailscale install | status | url | uninstall`. */
export const tailscaleCommand = makeTailscaleCommand({
  name: "cterm",
  ports: Config.pipe(Effect.flatMap((config) => config.get)),
  health: healthLine,
})
