import path from "node:path"

import { defineConfig, devices } from "@playwright/test"

const port = 3211
const baseURL = `http://127.0.0.1:${port}`
const stateDir = path.resolve(process.cwd(), ".playwright")
const tmuxDir = path.join(stateDir, "tmux")
const isCi = Boolean(process.env.CI)

/** CI reports for GitHub and retries flaky runs; local runs list and fail fast. */
const ciSettings = () => {
  if (isCi) {
    return { reporter: "github" as const, retries: 2 }
  }
  return { reporter: "list" as const, retries: 0 }
}

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
  ...ciSettings(),
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "bun e2e/stt-server.ts",
      reuseExistingServer: false,
      url: "http://127.0.0.1:3212/health",
    },
    {
      command: `mkdir -p ${tmuxDir}; for session in 1 2 3; do tmux kill-session -t cterm-e2e-$session 2>/dev/null || true; done; bun src/cli/index.ts serve --server-port ${port}`,
      env: {
        CTERM_TMUX_SESSION: "cterm-e2e",
        CTERM_STT_URL: "http://127.0.0.1:3212",
        CTERM_UI_DIR: path.join(stateDir, "dist-ui"),
        TMUX_TMPDIR: tmuxDir,
        XDG_CACHE_HOME: path.join(stateDir, "cache"),
        XDG_CONFIG_HOME: path.join(stateDir, "config"),
      },
      // A reused dev server would not point CTERM_STT_URL at the fake stt server.
      reuseExistingServer: false,
      timeout: 180_000,
      url: `${baseURL}/health`,
    },
  ],
  workers: 1,
})
