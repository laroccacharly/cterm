import { test as base } from "@playwright/test"

import { killTestTmuxServer } from "./helpers.ts"

export { expect } from "@playwright/test"

/** Playwright `test` where every test starts and ends with no tmux server. */
export const test = base.extend<{ isolatedTmux: null }>({
  isolatedTmux: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument.
    async ({}, use) => {
      killTestTmuxServer()
      await use(null)
      killTestTmuxServer()
    },
    { auto: true },
  ],
})
