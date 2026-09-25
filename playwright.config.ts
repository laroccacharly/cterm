import path from "node:path"

import { defineConfig, devices } from "@playwright/test"

const port = 3211
const baseURL = `http://127.0.0.1:${port}`
const stateDir = path.resolve(process.cwd(), ".playwright")
const tmuxDir = path.join(stateDir, "tmux")
const isCi = Boolean(process.env.CI)

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: isCi,
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
          ],
        },
        permissions: ["microphone"],
      },
    },
  ],
  reporter: isCi ? "github" : "list",
  retries: isCi ? 2 : 0,
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `mkdir -p ${tmuxDir}; for session in 1 2 3; do tmux kill-session -t cterm-e2e-$session 2>/dev/null || true; done; bun src/cli/index.ts serve --port ${port}`,
    env: {
      CTERM_TMUX_SESSION: "cterm-e2e",
      TMUX_TMPDIR: tmuxDir,
      XDG_CONFIG_HOME: path.join(stateDir, "config"),
    },
    reuseExistingServer: !isCi,
    timeout: 180_000,
    url: `${baseURL}/health`,
  },
  workers: 1,
})
