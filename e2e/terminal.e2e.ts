import { expect, test } from "@playwright/test"

import { activeRows, killTestSessions, runInActiveTerminal } from "./helpers.ts"

test.afterAll(killTestSessions)

test("runs commands in ~/Work and keeps the tmux session across reloads", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator("[data-status]")).toHaveAttribute(
    "data-status",
    "connected"
  )

  await runInActiveTerminal(page, "printf '__CTERM_CWD__%s\\n' \"$PWD\"")
  await expect(activeRows(page)).toContainText(
    `__CTERM_CWD__${process.env.HOME}/Work`
  )

  await runInActiveTerminal(page, "export CTERM_E2E_PERSIST=works")
  await page.reload()
  await expect(page.locator("[data-status]")).toHaveAttribute(
    "data-status",
    "connected"
  )

  await runInActiveTerminal(
    page,
    "printf '__CTERM_PERSIST__%s\\n' \"$CTERM_E2E_PERSIST\""
  )
  await expect(activeRows(page)).toContainText("__CTERM_PERSIST__works")
})

test("Ctrl+C button interrupts the foreground process", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await runInActiveTerminal(
    page,
    "printf '__CTERM_BEFORE_CTRLC__\\n'; sleep 30"
  )
  await expect(activeRows(page)).toContainText("__CTERM_BEFORE_CTRLC__")

  await page.getByRole("button", { name: "Send Ctrl+C" }).click()
  await runInActiveTerminal(page, "printf '__CTERM_AFTER_CTRLC__\\n'")
  await expect(activeRows(page)).toContainText("__CTERM_AFTER_CTRLC__")
})

test("cd .. button navigates to the parent directory", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await runInActiveTerminal(page, "cd /tmp")
  await runInActiveTerminal(page, "printf '__CTERM_DIR__%s\\n' \"$PWD\"")
  await expect(activeRows(page)).toContainText("__CTERM_DIR__/tmp")

  await page.getByRole("button", { name: "Change to parent directory" }).click()
  await runInActiveTerminal(page, "printf '__CTERM_PARENT__%s\\n' \"$PWD\"")
  await expect(activeRows(page)).toContainText("__CTERM_PARENT__/")
})

test("paste button inserts clipboard text", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await page.evaluate(async () => {
    await navigator.clipboard.writeText("__CTERM_PASTE__")
  })
  await page.getByRole("button", { name: "Paste from clipboard" }).click()
  await expect(activeRows(page)).toContainText("__CTERM_PASTE__")
})

test("Enter button submits the current line", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  const input = page
    .locator(".terminal-frame--active")
    .getByLabel("Terminal input")
  await input.focus()
  await page.keyboard.type("echo $((6*7))")
  await page.getByRole("button", { name: "Send Enter" }).click()
  await expect(activeRows(page)).toContainText(/\b42\b/u)
})

test("pi shortcut button is available and labelled with the pi symbol", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  const piButton = page.getByRole("button", { name: "Run pi" })
  await expect(piButton).toBeVisible()
  await expect(piButton).toHaveText("π")
})

test("force refresh reloads the app with a cache-busting URL", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await page.getByRole("button", { name: "Force refresh" }).click()

  await expect(page).toHaveURL(/[?&]reload=\d+/u)
  await expect(page.locator('[data-status="connected"]')).toBeAttached()
})

test("commit and push shortcut types the request and submits it", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  const button = page.getByRole("button", { name: "Commit and push" })
  await expect(button).toBeVisible()
  await expect(button).toHaveText("C&P")

  await button.click()
  await expect(activeRows(page)).toContainText("commit and push")
})

test("new session shortcut starts a fresh shell", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  const button = page.getByRole("button", { name: "New session" })
  await expect(button).toBeVisible()
  await expect(button).toHaveText("new")

  await button.click()
  await expect(activeRows(page)).toContainText("/new")
})

test("font size commands scale the terminal text", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  // xterm recomputes its character cell from the font size, so a larger font
  // fits fewer rows in the same viewport. Measure on the Commands page so the
  // header (and therefore the available height) stays constant while testing.
  await page.getByRole("button", { name: "Commands", exact: true }).click()
  await expect(page.getByRole("region", { name: "Commands" })).toBeVisible()

  const rowCount = async () =>
    await page
      .locator('.terminal-frame[data-session="1"] .xterm-rows > div')
      .count()
  // Switching views shrinks the header, so wait for the terminal to re-fit
  // before using the row count as the baseline.
  const settledRowCount = async () => {
    let previous = -1
    await expect
      .poll(async () => {
        const current = await rowCount()
        const stable = current === previous
        previous = current
        return stable
      })
      .toBe(true)
    return await rowCount()
  }
  const initial = await settledRowCount()

  await page.getByRole("button", { name: "Increase font size" }).click()
  await expect.poll(rowCount).toBeLessThan(initial)

  await page.getByRole("button", { name: "Decrease font size" }).click()
  await expect.poll(rowCount).toBe(initial)
})

test("voice transcription types into the terminal", async ({ page }) => {
  await page.route("**/transcribe", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ text: "echo $((40+2))" }),
      contentType: "application/json",
      status: 200,
    })
  })
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await page.getByRole("button", { name: "Start voice input" }).click()
  await expect(
    page.getByRole("button", { name: "Stop voice input" })
  ).toBeVisible()
  await page.waitForTimeout(300)
  await page.getByRole("button", { name: "Stop voice input" }).click()

  await expect(activeRows(page)).toContainText("echo $((40+2))")
  await page.keyboard.press("Enter")
  await expect(activeRows(page)).toContainText(/\b42\b/u)
})

test("rejects cross-origin WebSocket upgrades", async ({ request }) => {
  const response = await request.get("/ws", {
    headers: {
      Connection: "Upgrade",
      Host: "127.0.0.1:3211",
      Origin: "https://attacker.example",
      Upgrade: "websocket",
    },
  })

  expect(response.status()).toBe(403)
})
