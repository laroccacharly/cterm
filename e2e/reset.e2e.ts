import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"

import {
  activeRows,
  killTestSessions,
  runInActiveTerminal,
  sessionTab,
  stateDir,
  testTmux,
} from "./helpers.ts"

test.afterAll(killTestSessions)

const rcFile = path.join(stateDir, "reset-bashrc")

test("reset starts a fresh shell that picks up rc changes", async ({
  page,
}) => {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(rcFile, "")

  await page.goto("/")
  await expect(sessionTab(page, 1)).toHaveAttribute("aria-pressed", "true")
  await runInActiveTerminal(page, "printf '__ONE__%s\\n' ready")
  await expect(activeRows(page)).toContainText("__ONE__ready")

  // Mirror a user config that keeps clients alive when sessions die.
  testTmux("set-option", "-g", "detach-on-destroy", "off")
  testTmux("set-option", "-g", "default-command", `bash --rcfile ${rcFile} -i`)

  await sessionTab(page, 3).click()
  await expect(sessionTab(page, 3)).toHaveAttribute("aria-pressed", "true")
  await runInActiveTerminal(page, "cterm_e2e_alias || echo __MISSING__")
  await expect(activeRows(page)).toContainText("__MISSING__")

  writeFileSync(rcFile, "alias cterm_e2e_alias='echo __ALIAS_OK__'\n")

  const reset = page.getByRole("button", { name: "Reset terminal session 3" })
  await reset.click()
  await expect(reset).toHaveText("Confirm?")
  await reset.click()

  await expect(activeRows(page)).not.toContainText("__MISSING__")
  await expect(
    page.locator('.terminal-frame--active[data-session="3"]')
  ).toBeVisible()
  await expect(async () => {
    await runInActiveTerminal(page, "cterm_e2e_alias")
    await expect(activeRows(page)).toContainText("__ALIAS_OK__", {
      timeout: 1000,
    })
  }).toPass()

  await runInActiveTerminal(page, "tmux display-message -p '__SESSION__#S'")
  await expect(activeRows(page)).toContainText("__SESSION__cterm-e2e-3")

  await sessionTab(page, 1).click()
  await runInActiveTerminal(page, "tmux display-message -p '__SESSION__#S'")
  await expect(activeRows(page)).toContainText("__SESSION__cterm-e2e-1")
  await expect(activeRows(page)).toContainText("__ONE__ready")
})
