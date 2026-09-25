import { expect, test } from "@playwright/test"

const patch = `diff --git a/src/example.ts b/src/example.ts
index 3b18e51..af2e8cd 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1 +1 @@
-export const answer = 41
+export const answer = 42
`

test("toggles between the terminal and a mobile-friendly diff", async ({
  page,
}) => {
  await page.route(/\/diff(?:\?|$)/u, async (route) => {
    await route.fulfill({
      body: JSON.stringify({ patch, repository: "/home/user/Work/example" }),
      contentType: "application/json",
    })
  })
  await page.setViewportSize({ height: 844, width: 390 })
  await page.goto("/")
  await expect(page.locator('[data-status="connected"]')).toBeAttached()
  await expect(page.getByRole("button", { name: "Send Enter" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh diff" })).toHaveCount(
    0
  )

  const headerBottom = await page
    .locator(".app-header")
    .evaluate((element) => element.getBoundingClientRect().bottom)
  const terminalTop = await page
    .getByRole("region", { name: "cterm terminal 1", exact: true })
    .evaluate((element) => element.getBoundingClientRect().top)
  expect(terminalTop).toBeGreaterThanOrEqual(headerBottom)

  await page.getByRole("button", { name: "Diff", exact: true }).click()
  await expect(page.getByRole("region", { name: "Git diff" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh diff" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Send Enter" })).toHaveCount(0)
  await expect(page.getByText("src/example.ts")).toBeVisible()
  await expect(page.getByText("export const answer = 42")).toBeVisible()

  await page.getByRole("button", { name: "Terminal", exact: true }).click()
  await expect(
    page.getByRole("region", { name: "cterm terminal 1", exact: true })
  ).toBeVisible()
})
