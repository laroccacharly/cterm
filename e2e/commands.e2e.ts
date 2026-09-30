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

test("hides voice commands while keeping voice input available", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()

  await expect(
    page.getByRole("button", { name: /voice command/iu })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Start voice input" })
  ).toBeVisible()
})
