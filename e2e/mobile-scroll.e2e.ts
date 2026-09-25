import type { Page } from "@playwright/test"
import { expect, test } from "@playwright/test"

import { activeRows, killTestSessions, runInActiveTerminal } from "./helpers.ts"

test.use({ hasTouch: true })

test.afterAll(killTestSessions)

// Playwright has no touch-drag helper, so drive Chrome DevTools Protocol touch
// events directly. xterm's gesture service listens to document touch events.
const touchDrag = async (
  page: Page,
  fromY: number,
  toY: number
): Promise<void> => {
  const client = await page.context().newCDPSession(page)
  const x = 195
  const steps = 16

  await client.send("Input.dispatchTouchEvent", {
    touchPoints: [{ x, y: fromY }],
    type: "touchStart",
  })
  for (let step = 1; step <= steps; step += 1) {
    // oxlint-disable-next-line no-await-in-loop -- CDP touch events must arrive in order
    await client.send("Input.dispatchTouchEvent", {
      touchPoints: [{ x, y: fromY + ((toY - fromY) * step) / steps }],
      type: "touchMove",
    })
  }
  await client.send("Input.dispatchTouchEvent", {
    touchPoints: [],
    type: "touchEnd",
  })
  await client.detach()
}

test("touch drag scrolls the terminal scrollback", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await runInActiveTerminal(page, "seq 1 200")
  await expect(activeRows(page)).toContainText("200")

  const before = await activeRows(page).textContent()

  await touchDrag(page, 200, 640)

  await expect
    .poll(async () => await activeRows(page).textContent())
    .not.toBe(before)
  const after = await activeRows(page).textContent()
  expect(after).not.toContain("200")
})
