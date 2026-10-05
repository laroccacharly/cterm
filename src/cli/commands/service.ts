import path from "node:path"

import { serviceCommand as systemdServiceCommand } from "effect-lib/systemd"

const repoRoot = path.resolve(import.meta.dir, "../../..")

/** `cterm serve` as a systemd user service, started at login. */
export const serviceCommand = systemdServiceCommand({
  name: "cterm",
  description: "cterm private tailnet web terminal",
  script: path.join(repoRoot, "src", "cli", "index.ts"),
  args: ["serve"],
  restart: "always",
  restartSec: 5,
  extra: {
    unit: { After: "network-online.target", Wants: "network-online.target" },
    // KillMode=process keeps tmux servers alive when cterm is restarted or upgraded.
    service: {
      WorkingDirectory: repoRoot,
      KillMode: "process",
      TimeoutStopSec: "15",
    },
  },
})
