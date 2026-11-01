import { spawnSync } from "node:child_process"
import path from "node:path"

import type { CDPSession, Locator, Page } from "@playwright/test"

export const stateDir = path.resolve(process.cwd(), ".playwright")

/** Run tmux against the isolated server used by the Playwright cterm. */
export const testTmux = (...args: readonly string[]): string =>
  spawnSync("tmux", args, {
    encoding: "utf-8",
    env: { ...process.env, TMUX: "", TMUX_TMPDIR: path.join(stateDir, "tmux") },
  }).stdout

/**
 * Stop the Playwright tmux server, dropping its sessions and any global
 * options a test set. cterm starts a fresh server on the next connection.
 */
export const killTestTmuxServer = (): void => {
  testTmux("kill-server")
}

/** The live rows of the terminal session that is currently visible. */
export const activeRows = (page: Page): Locator =>
  page.locator(".terminal-frame--active .terminal > .xterm .xterm-rows")

/** The hidden input of the terminal session that is currently visible. */
export const activeInput = (page: Page): Locator =>
  page.locator(".terminal-frame--active").getByLabel("Terminal input")

/** Type a command into the active terminal and submit it. */
export const runInActiveTerminal = async (
  page: Page,
  command: string
): Promise<void> => {
  await activeInput(page).focus()
  await page.keyboard.type(command)
  await page.keyboard.press("Enter")
}

/** Every session tab button in the session navigation row. */
export const sessionTab = (page: Page, session: number): Locator =>
  page.getByRole("button", { exact: true, name: `Terminal session ${session}` })

/** Horizontal position of synthetic touches, inside the terminal. */
export const touchX = 195

// Playwright has no touch-drag helper, so drive Chrome DevTools Protocol touch
// events directly. xterm's gesture service listens to document touch events.
export const withTouch = async (
  page: Page,
  run: (client: CDPSession) => Promise<void>
): Promise<void> => {
  const client = await page.context().newCDPSession(page)
  await run(client)
  await client.detach()
}

/** Drag one finger vertically across the page. */
export const touchDrag = async (
  page: Page,
  fromY: number,
  toY: number
): Promise<void> => {
  await withTouch(page, async (client) => {
    const steps = 16
    await client.send("Input.dispatchTouchEvent", {
      touchPoints: [{ x: touchX, y: fromY }],
      type: "touchStart",
    })
    for (let step = 1; step <= steps; step += 1) {
      // oxlint-disable-next-line no-await-in-loop -- CDP touch events must arrive in order
      await client.send("Input.dispatchTouchEvent", {
        touchPoints: [{ x: touchX, y: fromY + ((toY - fromY) * step) / steps }],
        type: "touchMove",
      })
    }
    await client.send("Input.dispatchTouchEvent", {
      touchPoints: [],
      type: "touchEnd",
    })
  })
}
