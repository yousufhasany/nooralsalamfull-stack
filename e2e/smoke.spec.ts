import { test, expect } from "@playwright/test";

test("public home shows the hotel name and availability search", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /availability|توفر|পাওয়া/i }).or(page.getByRole("link", { name: /book/i }))).toBeVisible();
});

test("Arabic home is RTL", async ({ page }) => {
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("admin login is reachable and does not claim a channel is connected", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: /sign in|تسجيل/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByText(/booking\.com connected/i)).toHaveCount(0);
});
