import { existsSync } from "node:fs"
import path from "node:path"

import { expect, test } from "./fixtures.ts"
import { activeInput, activeRows, stateDir } from "./helpers.ts"

const uploadsDir = path.join(stateDir, "cache", "cterm", "uploads")
const savedPath = new RegExp(`${uploadsDir}/\\S+-shot-[\\da-f]{6}\\.png`, "u")
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)

test("attach dialog saves a file and pastes its path", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await page.getByRole("button", { name: "Attach files" }).click()
  await page
    .getByRole("dialog", { name: "Attach files" })
    .getByLabel("Choose files")
    .setInputFiles({ buffer: png, mimeType: "image/png", name: "shot.png" })

  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(activeRows(page)).toContainText(savedPath)
  const rows = await activeRows(page).textContent()
  const pasted = rows?.match(savedPath)?.[0]
  expect(pasted !== undefined && existsSync(pasted)).toBe(true)
})

test("dropping a file on the terminal pastes its path", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  const dataTransfer = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer()
    transfer.items.add(
      new File([new Uint8Array(bytes)], "shot.png", { type: "image/png" })
    )
    return transfer
  }, [...png])
  const frame = page.locator(".terminal-frame--active")
  await frame.dispatchEvent("dragover", { dataTransfer })
  await expect(page.getByText("Drop files to paste their paths")).toBeVisible()
  await frame.dispatchEvent("drop", { dataTransfer })

  await expect(activeRows(page)).toContainText(savedPath)
})

test("pasting an image into the terminal pastes its saved path", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await activeInput(page).evaluate((input, bytes) => {
    const transfer = new DataTransfer()
    transfer.items.add(
      new File([new Uint8Array(bytes)], "shot.png", { type: "image/png" })
    )
    input.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer })
    )
  }, [...png])

  await expect(activeRows(page)).toContainText(savedPath)
})
