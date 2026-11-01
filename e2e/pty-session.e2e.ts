import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures.ts"
import {
  activeRows,
  runInActiveTerminal,
  sessionTab,
  touchDrag,
} from "./helpers.ts"

test.use({ hasTouch: true })

const openFourthSession = async (page: Page): Promise<void> => {
  await sessionTab(page, 4).click()
  await expect(page.locator("[data-status]")).toHaveAttribute(
    "data-status",
    "connected"
  )
}

test("session 4 keeps its shell and history across reloads without tmux", async ({
  page,
}) => {
  await page.goto("/")
  await openFourthSession(page)
  await runInActiveTerminal(page, "export CTERM_PTY=kept; seq 1 200")
  await expect(activeRows(page)).toContainText("200")

  await page.reload()
  await openFourthSession(page)
  // The server replays the screen into the fresh browser terminal.
  await expect(activeRows(page)).toContainText("200")
  await runInActiveTerminal(
    page,
    `printf '__PTY__%s %s\\n' "$CTERM_PTY" "\${TMUX:-none}"`
  )
  await expect(activeRows(page)).toContainText("__PTY__kept none")
})

test("session 4 scrolls the replayed history in the browser", async ({
  page,
}) => {
  const inputFrames: string[] = []
  page.on("websocket", (socket) => {
    socket.on("framesent", (frame) => {
      inputFrames.push(String(frame.payload))
    })
  })
  await page.goto("/")
  await openFourthSession(page)
  await runInActiveTerminal(page, "seq 1 300")
  await expect(activeRows(page)).toContainText("300")
  await page.reload()
  await openFourthSession(page)
  await expect(activeRows(page)).toContainText("300")
  const sent = inputFrames.filter((frame) => frame.includes('"input"')).length

  await touchDrag(page, 200, 640)

  await expect(activeRows(page)).not.toContainText("300")
  await expect(
    page.locator(".terminal-frame--active").getByTestId("terminal-scrollback")
  ).toHaveCount(0)
  expect(inputFrames.filter((frame) => frame.includes('"input"')).length).toBe(
    sent
  )
})

test("Ctrl+C interrupts a running command in session 4", async ({ page }) => {
  await page.goto("/")
  await openFourthSession(page)
  await runInActiveTerminal(page, "printf '__PTY_BEFORE__\\n'; sleep 30")
  await expect(activeRows(page)).toContainText("__PTY_BEFORE__")

  await page.getByRole("button", { name: "Send Ctrl+C" }).click()
  await runInActiveTerminal(page, "printf '__PTY_AFTER__\\n'")
  await expect(activeRows(page)).toContainText("__PTY_AFTER__")
})
