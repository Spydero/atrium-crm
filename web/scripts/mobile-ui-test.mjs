import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const origin = process.env.WEB_URL || "http://localhost:3000";
const routes = ["", "leads", "calendar", "messages", "listings", "map", "shortlists", "guides", "money", "reports", "settings"];
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@atrium.demo");
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(origin + "/app");

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 760 });
    for (const route of routes) {
      await page.goto(origin + "/app" + (route ? "/" + route : ""), { waitUntil: "networkidle" });
      await expect(page.locator("main h1").first()).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= width,
        `Horizontal overflow on /app/${route} at ${width}px`);
      if (width >= 768) continue;

      if (route === "") {
        const menu = page.getByRole("button", { name: "Menu", exact: true });
        await menu.tap();
        await expect(page.getByRole("navigation", { name: "Workspace" }).getByRole("link")).toHaveCount(routes.length);
        await page.keyboard.press("Escape");
        await expect(menu).toBeFocused();
        await menu.tap();
        await page.getByRole("link", { name: "Settings", exact: true }).tap();
        await page.waitForURL(origin + "/app/settings");
        await expect(menu).toHaveAttribute("aria-expanded", "false");
      }
      if (route === "leads") {
        await page.locator("[data-lead-card]").first().tap();
        await expect(page.locator("main h2:focus")).toBeInViewport();
        await page.getByRole("button", { name: "Close", exact: true }).first().tap();
        await page.getByRole("button", { name: "Add lead", exact: true }).first().tap();
        const dialog = page.getByRole("dialog", { name: "Add lead" });
        await dialog.getByRole("button", { name: "Cancel" }).tap();
        await expect(dialog).toBeHidden();
      }
      if (route === "calendar") {
        const grid = page.getByTestId("calendar-grid");
        const day = grid.getByRole("button", { pressed: false }).nth(12);
        const label = await day.getAttribute("aria-label");
        await day.tap();
        await expect(grid.getByRole("button", { pressed: true })).toHaveAttribute("aria-label", label);
      }
    }
    console.log(`Passed ${routes.length} workspace pages at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
