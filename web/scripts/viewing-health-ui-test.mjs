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

  // Dashboard: viewing health card + stacked trend
  await page.goto(`${WEB}/app`, { waitUntil: "networkidle" });
  await page.getByTestId("trend-card").waitFor();
  await settle(1000);
  log(await page.getByTestId("viewing-health-card").isVisible(), "Dashboard Viewing health card");
  await page.getByTestId("viewing-health-card").screenshot({
    path: path.join(SHOTS, "v19-01-dashboard-viewing-health-card.png"),
  });

  await page.getByTestId("trend-card").getByRole("button", { name: "Viewings", exact: true }).click();
  await settle(1200);
  const summary = (await page.getByTestId("trend-summary").innerText()).replace(/\s+/g, " ");
  log(/viewing/i.test(summary), "Viewings metric summary", summary.slice(0, 100));
  log(await page.getByTestId("hide-cancelled-trend").isVisible(), "Hide cancelled toggle on viewings");
  await page.getByTestId("trend-card").screenshot({
    path: path.join(SHOTS, "v19-02-dashboard-viewings-stacked.png"),
  });
  await page.getByTestId("hide-cancelled-trend").uncheck();
  await settle(600);
  log(!(await page.getByTestId("hide-cancelled-trend").isChecked()), "Hide cancelled can be turned off");
  await page.getByTestId("trend-card").screenshot({
    path: path.join(SHOTS, "v19-03-dashboard-viewings-with-cancelled.png"),
  });

  // Reports Viewing health
  await page.goto(`${WEB}/app/reports#viewings`, { waitUntil: "networkidle" });
  await page.getByTestId("viewing-health").waitFor({ timeout: 15000 });
  await settle(1000);
  const vh = page.getByTestId("viewing-health");
  log(await vh.getByText("Viewing health").first().isVisible(), "Reports Viewing health section");
  log(await vh.getByText("Held rate").isVisible(), "Held rate tile");
  log(await vh.getByText("Cancel rate").isVisible(), "Cancel rate tile");
  log(await vh.getByText("Why cancelled").isVisible(), "Cancel reasons panel");
  log(await vh.getByText("Recent cancellations").isVisible(), "Recent cancellations table");
  await page.screenshot({ path: path.join(SHOTS, "v19-04-reports-viewing-health.png"), fullPage: false });
  await vh.screenshot({ path: path.join(SHOTS, "v19-05-reports-viewing-health-full.png") });

  await vh.getByRole("button", { name: "rates", exact: true }).click();
  await settle(500);
  log(await vh.getByRole("button", { name: "rates", exact: true }).getAttribute("aria-pressed") === "true", "Rates chart mode");
  await vh.getByRole("button", { name: "listing", exact: true }).click();
  await settle(400);
  log(await vh.getByRole("button", { name: "listing", exact: true }).getAttribute("aria-pressed") === "true", "Breakdown by listing");
  await page.screenshot({ path: path.join(SHOTS, "v19-06-reports-viewing-breakdown.png"), fullPage: false });

  // Export menu includes cancel CSV
  await page.getByRole("button", { name: /export/i }).first().click();
  await settle(300);
  log(
    await page.getByRole("menuitem", { name: /Cancellations \(CSV\)/i }).isVisible(),
    "Export menu has cancellations CSV",
  );
  log(
    await page.getByRole("menuitem", { name: /Viewings \(CSV\)/i }).isVisible(),
    "Export menu has viewings CSV",
  );
  await page.screenshot({ path: path.join(SHOTS, "v19-07-reports-export-menu.png") });

  log(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
} catch (e) {
  failed++;
  console.error("FAIL  script error -", e);
  await page.screenshot({ path: path.join(SHOTS, "v19-error.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

console.log(failed ? `\n${failed} failed` : "\nAll viewing health UI checks passed");
process.exit(failed ? 1 : 0);
