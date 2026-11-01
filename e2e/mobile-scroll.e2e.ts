import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures.ts"
import {
  activeRows,
  runInActiveTerminal,
  touchDrag,
  touchX,
  withTouch,
} from "./helpers.ts"

test.use({ hasTouch: true })

const tap = async (page: Page, y: number): Promise<void> => {
  await withTouch(page, async (client) => {
    await client.send("Input.dispatchTouchEvent", {
      touchPoints: [{ x: touchX, y }],
      type: "touchStart",
    })
    await client.send("Input.dispatchTouchEvent", {
      touchPoints: [],
      type: "touchEnd",
    })
  })
}

/** Count terminal input frames and scrollback requests from now on. */
const watchTraffic = (page: Page) => {
  const traffic = { inputFrames: 0, scrollbackRequests: 0 }
  page.on("websocket", (socket) => {
    socket.on("framesent", (frame) => {
      if (String(frame.payload).includes('"type":"input"')) {
        traffic.inputFrames += 1
      }
    })
  })
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/scrollback") {
      traffic.scrollbackRequests += 1
    }
  })
  return traffic
}

const scrollback = (page: Page) =>
  page.locator(".terminal-frame--active").getByTestId("terminal-scrollback")

test("touch swipes scroll shell history locally", async ({ page }) => {
  const traffic = watchTraffic(page)
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()
  await runInActiveTerminal(page, "seq 1 200")
  await expect(activeRows(page)).toContainText("200")
  const typed = traffic.inputFrames

  const pendingResponse = page.waitForResponse("**/scrollback?session=1")
  await touchDrag(page, 200, 640)
  const response = await pendingResponse
  expect(response.headers()["content-encoding"]).toBe("gzip")

  await expect(scrollback(page)).toBeVisible()
  const rows = scrollback(page).locator(".xterm-rows")
  await expect(rows).not.toContainText("200")
  const firstScreen = await rows.textContent()

  // Further swipes start on the snapshot and never reach the server.
  await touchDrag(page, 200, 640)
  await expect.poll(async () => await rows.textContent()).not.toBe(firstScreen)
  expect(traffic.scrollbackRequests).toBe(1)
  expect(traffic.inputFrames).toBe(typed)

  // The live terminal never scrolled, so it is still at the bottom.
  await expect(activeRows(page)).toContainText("200")
})

test("tapping or typing returns to the live terminal", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()
  await runInActiveTerminal(page, "seq 1 200")
  await expect(activeRows(page)).toContainText("200")

  await touchDrag(page, 200, 640)
  await expect(scrollback(page)).toBeVisible()
  await tap(page, 400)
  await expect(scrollback(page)).toHaveCount(0)

  await touchDrag(page, 200, 640)
  await expect(scrollback(page)).toBeVisible()
  await page.getByRole("button", { name: "Send Enter" }).click()
  await expect(scrollback(page)).toHaveCount(0)

  await touchDrag(page, 200, 640)
  await expect(scrollback(page)).toBeVisible()
  await runInActiveTerminal(page, "echo live-again")
  await expect(scrollback(page)).toHaveCount(0)
  await expect(activeRows(page)).toContainText("live-again")
})

test("full-screen apps still receive touch swipes", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()
  // Enter the alternate screen with SGR mouse reporting, like vim or
  // fullscreen pi, and let the tty echo every report it receives.
  await runInActiveTerminal(
    page,
    String.raw`printf '\033[?1049h\033[?1000h\033[?1006h'; cat`
  )

  // The first swipe learns that the app owns the screen; the second goes
  // straight to it.
  await touchDrag(page, 200, 640)
  await touchDrag(page, 200, 640)

  await expect(scrollback(page)).toHaveCount(0)
  await expect(activeRows(page)).toContainText(/\[<6[45];/u)
})

test("swipes scroll through tmux when history is unavailable", async ({
  page,
}) => {
  // As with a newer UI served by an older cterm that lacks the endpoint.
  await page.route("**/scrollback?*", async (route) => {
    await route.fulfill({ body: "Not found", status: 404 })
  })
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()
  await runInActiveTerminal(page, "seq 1 200")
  await expect(activeRows(page)).toContainText("200")

  await touchDrag(page, 200, 640)
  await touchDrag(page, 200, 640)

  // tmux scrolled into copy mode, which shows its position indicator.
  await expect(activeRows(page)).toContainText(/\[\d+\/\d+\]/u)
  await expect(scrollback(page)).toHaveCount(0)
})
