import { spawnSync } from "node:child_process"
import path from "node:path"

import type { Locator, Page } from "@playwright/test"

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

/** The scrollback of the terminal session that is currently visible. */
export const activeRows = (page: Page): Locator =>
  page.locator(".terminal-frame--active .xterm-rows")

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
