import { expect, test } from "@playwright/test"

test("shows an error toast when transcription fails", async ({ page }) => {
  await page.route("**/transcribe", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ message: "Transcription service is down" }),
      contentType: "application/json",
      status: 502,
    })
  })
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await page.getByRole("button", { name: "Start voice input" }).click()
  await page.waitForTimeout(300)
  await page.getByRole("button", { name: "Stop voice input" }).click()

  const toast = page
    .getByRole("list", { name: "Notifications" })
    .getByRole("alert")
  await expect(toast).toHaveCount(1)
  await expect(toast).toContainText("Transcription service is down")

  await toast.getByRole("button", { name: "Dismiss" }).click()
  await expect(toast).toHaveCount(0)
})
