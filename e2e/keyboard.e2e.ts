import { devices, expect, test } from "@playwright/test"
import { Option, Predicate } from "effect"

import { parseClientMessage } from "../src/terminal/protocol.ts"
import { activeInput, killTestSessions } from "./helpers.ts"

test.use({ ...devices["Pixel 5"] })

test.afterAll(killTestSessions)

test("soft keyboard stays closed until the keyboard button is tapped", async ({
  page,
}) => {
  let latestRows: number | undefined
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (!Predicate.isString(payload)) {
        return
      }
      const message = parseClientMessage(payload)
      if (Option.isSome(message) && message.value.type === "resize") {
        latestRows = message.value.rows
      }
    })
  })
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  const viewportWidth = await page.evaluate(() => window.innerWidth)
  const terminalWidth = await page
    .locator(".terminal-frame--active > .terminal")
    .evaluate((element) => element.getBoundingClientRect().width)
  expect(terminalWidth).toBeLessThanOrEqual(viewportWidth)
  await expect.poll(() => latestRows).toBeGreaterThan(24)

  const input = activeInput(page)
  await expect(input).toHaveJSProperty("readOnly", true)
  await expect(input).toHaveAttribute("inputmode", "none")
  await expect(input).not.toBeFocused()
  await expect(input).toHaveCSS("font-size", "16px")

  await page.getByRole("button", { name: "Send Ctrl+C" }).click()
  await expect(input).not.toBeFocused()

  await page.getByRole("button", { name: "Show keyboard" }).click()
  await expect(input).toHaveJSProperty("readOnly", false)
  await expect(
    page.getByRole("button", { name: "Hide keyboard" })
  ).toBeVisible()

  await page.keyboard.type("printf '__CTERM_SIZE__'; stty size")
  await page.keyboard.press("Enter")
  const rows = page.locator(".terminal-frame--active .xterm-rows")
  await expect(rows).toContainText(/__CTERM_SIZE__\d+ \d+/u)
  const terminalText = await rows.textContent()
  const size = terminalText?.match(
    /__CTERM_SIZE__(?<rows>\d+) (?<columns>\d+)/u
  )
  expect(Number(size?.groups?.rows)).toBeGreaterThan(24)

  await page.getByRole("button", { name: "Hide keyboard" }).click()
  await expect(input).toHaveJSProperty("readOnly", true)
  await expect(
    page.getByRole("button", { name: "Show keyboard" })
  ).toBeVisible()
})
