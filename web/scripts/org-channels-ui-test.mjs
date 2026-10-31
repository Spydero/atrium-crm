/**
 * Org channels UI smoke + screenshots (v20).
 * Requires web :3000 and api :4000 with seeded demo.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = process.env.WEB_URL || "http://localhost:3000";
const API = process.env.API_URL || "http://localhost:4000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../design/screenshots");

function log(ok, msg) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) process.exitCode = 1;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log(`SHOT  ${name}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });

  // Settings channels
  await page.goto(`${WEB}/app/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const channelsBlock = page.getByTestId("channels-settings");
  log(await channelsBlock.isVisible(), "Settings Channels section visible");
  log(await page.getByText("Channels", { exact: true }).first().isVisible(), "Channels heading");
  log(
    (await page.getByText(/simulate bayut|live bayut api/i).count()) === 0 ||
      (await page.getByText(/not connected/i).count()) > 0,
    "No fake live portal API claim as primary CTA",
  );
  await shot(page, "v20-01-settings-channels.png");
  await channelsBlock.scrollIntoViewIfNeeded();
  await shot(page, "v20-02-settings-channels-full.png");

  // Leads log enquiry
  await page.goto(`${WEB}/app/leads`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const demo = page.getByRole("button", { name: /demo tools/i });
  log(await demo.isVisible(), "Demo tools menu present");
  await demo.click();
  await page.waitForTimeout(300);
  log(await page.getByText(/log enquiry/i).isVisible(), "Log enquiry menu label");
  log((await page.getByRole("button", { name: /simulate/i }).count()) === 0, "No Simulate buttons");
  await shot(page, "v20-03-leads-log-enquiry.png");

  // Money map
  await page.goto(`${WEB}/app/money`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  log(await page.getByRole("heading", { name: /money/i }).first().isVisible(), "Money Map loads");
  await shot(page, "v20-04-money-map-channels.png");

  // Spend editor
  const spendBtn = page.getByRole("button", { name: /enter spend|edit spend/i }).first();
  if (await spendBtn.isVisible().catch(() => false)) {
    await spendBtn.click();
    await page.waitForTimeout(400);
    await shot(page, "v20-05-money-spend-editor.png");
  } else {
    log(true, "Spend editor button not shown (skipped shot)");
  }

  await browser.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
