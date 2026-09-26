import { expect, test } from "@playwright/test"
import { Schema } from "effect"

import { CommandsResponseSchema, commands } from "../src/commands/commands.ts"
import { activeRows } from "./helpers.ts"

const decodeCommandsResponse = Schema.decodeUnknownSync(CommandsResponseSchema)

test("serves the command catalogue from /commands", async ({ request }) => {
  const response = await request.get("/commands")

  expect(response.status()).toBe(200)
  const payload = decodeCommandsResponse(await response.json())
  expect(payload.commands.slice(0, commands.length)).toEqual([...commands])
  for (const command of payload.commands) {
    expect(command.label.length).toBeGreaterThan(0)
    expect(command.description.length).toBeGreaterThan(0)
  }
})

test("rejects non-GET requests to /commands", async ({ request }) => {
  const response = await request.post("/commands")

  expect(response.status()).toBe(405)
})

test("lists commands with descriptions on the Commands page", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  const shortcuts = page.locator(".terminal-controls")
  await expect(
    shortcuts.getByRole("button", { name: "Increase font size" })
  ).toHaveCount(0)
  await expect(
    shortcuts.getByRole("button", { name: "New session" })
  ).toHaveCount(1)

  await page.getByRole("button", { name: "Commands", exact: true }).click()
  await expect(page.getByRole("region", { name: "Commands" })).toBeVisible()

  await expect(page.getByRole("button", { name: "New session" })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Increase font size" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Decrease font size" })
  ).toBeVisible()
  await expect(
    page.getByText("Start a fresh shell session in the current directory.")
  ).toBeVisible()
})

test("runs a command from the Commands page in the terminal", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await page.getByRole("button", { name: "Commands", exact: true }).click()
  await page.getByRole("button", { name: "New session" }).click()
  await page.getByRole("button", { name: "Terminal", exact: true }).click()

  await expect(activeRows(page)).toContainText("/new")
})

test("runs a command picked from a voice transcript", async ({ page }) => {
  await page.route("**/transcribe", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ text: "start a new session" }),
      contentType: "application/json",
      status: 200,
    })
  })
  await page.route("**/voice-command", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        command: {
          action: { data: "/new\r", type: "input" },
          description: "Start a fresh shell session in the current directory.",
          id: "new-session",
          label: "New session",
        },
      }),
      contentType: "application/json",
      status: 200,
    })
  })
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await page.getByRole("button", { name: "Start voice command" }).click()
  await expect(
    page.getByRole("button", { name: "Stop voice command" })
  ).toBeVisible()
  await page.waitForTimeout(300)
  await page.getByRole("button", { name: "Stop voice command" }).click()

  await expect(activeRows(page)).toContainText("/new")
})

test("shows an alert when no command matches", async ({ page }) => {
  await page.route("**/transcribe", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ text: "do something impossible" }),
      contentType: "application/json",
      status: 200,
    })
  })
  await page.route("**/voice-command", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ command: null }),
      contentType: "application/json",
      status: 200,
    })
  })
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await page.getByRole("button", { name: "Start voice command" }).click()
  await page.waitForTimeout(300)
  await page.getByRole("button", { name: "Stop voice command" }).click()

  const dialog = page.getByRole("alertdialog", { name: "Notice" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText("No commands found")).toBeVisible()

  await dialog.getByRole("button", { name: "OK" }).click()
  await expect(dialog).toBeHidden()
})
