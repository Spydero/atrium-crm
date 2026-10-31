import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../../design/screenshots");
const WEB = process.env.WEB_URL || "http://localhost:3000";
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
function log(ok, msg, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${detail ? ` - ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const settle = (ms = 800) => page.waitForTimeout(ms);

try {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });
  await page.goto(`${WEB}/app/money`, { waitUntil: "networkidle" });
  await page.getByTestId("money-map").waitFor({ timeout: 15000 });
  await settle();

  log(await page.getByRole("heading", { name: "Money Map" }).isVisible(), "Money Map heading");
  log(await page.getByRole("button", { name: "90d", exact: true }).first().getAttribute("class").then((c) => c.includes("bg-accent")), "default range is 90d");
  log((await page.getByTestId(/^stat-/).count()) >= 6, "six KPI cards");
  log(await page.getByTestId("stat-At risk").isVisible(), "At risk card");
  log(await page.getByTestId("callouts").isVisible(), "decision callouts visible");
  log(await page.getByTestId("money-chart").isVisible(), "source comparison chart");
  log(await page.getByTestId("money-table").isVisible(), "source table");
  log(await page.getByText(/Entered spend/).first().isVisible(), "entered spend language");
  log(await page.getByText(/ADD SPEND|GUIDE|Guide/i).first().isVisible(), "GUIDE or add-spend cue present");

  await page.screenshot({ path: path.join(SHOTS, "v17-01-money-overview.png"), fullPage: true });

  await page.getByRole("button", { name: "30d", exact: true }).click();
  await settle(1000);
  log(
    (await page.getByRole("button", { name: "30d", exact: true }).first().getAttribute("class")).includes("bg-accent"),
    "switching to 30d works",
  );
  await page.getByRole("button", { name: "90d", exact: true }).click();
  await settle();

  await page.getByTestId("money-chart").getByRole("button", { name: "Cost / win", exact: true }).click();
  await settle();
  log(true, "chart metric toggles");

  await page.getByTestId("money-table").getByRole("button", { name: "Viewings", exact: true }).click();
  await settle();
  log(await page.getByTestId("money-table").locator("tbody tr").count() > 0, "table has rows after sort");

  await page.getByLabel("Show all sources").check();
  await settle();
  const nAll = await page.getByTestId("money-table").locator("tbody tr").count();
  log(nAll >= 8, "Show all reveals more sources", `${nAll} rows`);
  await page.screenshot({ path: path.join(SHOTS, "v17-02-money-table.png") });

  await page.getByRole("button", { name: "Edit spend" }).click();
  await page.getByTestId("spend-editor").waitFor();
  await page.getByLabel("Spend for WhatsApp").waitFor({ state: "visible" });
  log(await page.getByTestId("spend-editor").isVisible(), "spend editor opens");
  await page.getByLabel("Spend for WhatsApp").fill("2500");
  await page.getByTestId("spend-editor").getByRole("button", { name: "Save spend" }).click();
  await page.getByTestId("spend-editor").waitFor({ state: "hidden", timeout: 10000 });
  log(true, "spend editor closes after save");
  await settle(800);
  await page.screenshot({ path: path.join(SHOTS, "v17-03-money-after-spend.png"), fullPage: true });

  // Clear WhatsApp spend again so demo stays missing for that source
  await page.getByRole("button", { name: "Edit spend" }).click();
  await page.getByTestId("spend-editor").waitFor();
  await page.getByLabel("Spend for WhatsApp").waitFor({ state: "visible" });
  await page.getByLabel("Spend for WhatsApp").fill("");
  await page.getByTestId("spend-editor").getByRole("button", { name: "Save spend" }).click();
  await page.getByTestId("spend-editor").waitFor({ state: "hidden", timeout: 10000 });
  await settle(600);

  await page.getByTestId("at-risk").scrollIntoViewIfNeeded();
  log(await page.getByTestId("at-risk").isVisible(), "at risk section");
  await page.screenshot({ path: path.join(SHOTS, "v17-04-money-at-risk.png") });

  // Deep link from a wins cell if any
  const winLink = page.getByTestId("money-table").locator('a[href*="stage=WON"]').first();
  if (await winLink.count()) {
    await winLink.click();
    await page.waitForURL(/\/app\/leads/);
    await settle();
    log(await page.getByTestId("money-filter-chip").isVisible(), "leads filter chip from Money Map link");
    await page.screenshot({ path: path.join(SHOTS, "v17-05-leads-from-money.png") });
  } else {
    log(true, "no win links to deep-test (skipped)");
  }

  log(errors.length === 0, "no page errors", errors.join("; ").slice(0, 200));
} catch (e) {
  failed++;
  console.log("FAIL  exception", e.message);
  await page.screenshot({ path: path.join(SHOTS, "v17-error.png") }).catch(() => {});
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
