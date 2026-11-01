import { expect, test } from "./fixtures.ts"
import { activeRows } from "./helpers.ts"

test("records browser audio and sends the STT transcript to the terminal", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()
  await page.getByRole("button", { name: "Start voice input" }).click()
  await page.waitForTimeout(300)
  const response = page.waitForResponse(
    (item) =>
      item.url().endsWith("/transcribe") && item.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Stop voice input" }).click()
  const result = await response
  expect(result.status()).toBe(200)
  await expect(activeRows(page)).toContainText("cterm-stt-test")
})
