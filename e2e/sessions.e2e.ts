import { expect, test } from "@playwright/test"

import {
  activeRows,
  killTestSessions,
  runInActiveTerminal,
  sessionTab,
} from "./helpers.ts"

test.afterAll(killTestSessions)

test("keeps three terminal sessions open and switches between them", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  const tabs = page
    .getByRole("navigation", { name: "Terminal sessions" })
    .getByRole("button", { name: /^Terminal session \d$/u })
  await expect(tabs).toHaveCount(3)
  await expect(sessionTab(page, 1)).toHaveAttribute("aria-pressed", "true")
  await expect(sessionTab(page, 2)).toHaveAttribute("aria-pressed", "false")
  await expect(sessionTab(page, 3)).toHaveAttribute("aria-pressed", "false")

  await runInActiveTerminal(page, "export CTERM_SESSION_ONE=alpha")
  await runInActiveTerminal(
    page,
    "printf '__CTERM_ONE__%s\\n' \"$CTERM_SESSION_ONE\""
  )
  await expect(activeRows(page)).toContainText("__CTERM_ONE__alpha")

  await sessionTab(page, 2).click()
  await expect(sessionTab(page, 2)).toHaveAttribute("aria-pressed", "true")
  await runInActiveTerminal(
    page,
    `printf '__CTERM_TWO__%s\\n' "\${CTERM_SESSION_ONE:-unset}"`
  )
  await expect(activeRows(page)).toContainText("__CTERM_TWO__unset")

  await sessionTab(page, 1).click()
  await expect(sessionTab(page, 1)).toHaveAttribute("aria-pressed", "true")
  await runInActiveTerminal(
    page,
    "printf '__CTERM_ONE_AGAIN__%s\\n' \"$CTERM_SESSION_ONE\""
  )
  await expect(activeRows(page)).toContainText("__CTERM_ONE_AGAIN__alpha")

  await sessionTab(page, 3).click()
  await runInActiveTerminal(page, "printf '__CTERM_THREE__%s\\n' \"$PWD\"")
  await expect(activeRows(page)).toContainText(
    `__CTERM_THREE__${process.env.HOME}/Work`
  )
})

test("asks for the diff of the active session", async ({ page }) => {
  const requested: string[] = []
  await page.route(/\/diff(?:\?|$)/u, async (route) => {
    requested.push(route.request().url())
    await route.fulfill({
      body: JSON.stringify({
        patch: "",
        repository: "/home/user/Work/example",
      }),
      contentType: "application/json",
    })
  })
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await sessionTab(page, 3).click()
  await page.getByRole("button", { name: "Diff", exact: true }).click()
  await expect(page.getByRole("region", { name: "Git diff" })).toBeVisible()

  await expect.poll(() => requested.at(-1)).toContain("session=3")
})
