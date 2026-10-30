import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../../design/screenshots");
const DL = path.resolve(__dirname, "../../design/exports/ui-downloads");
const WEB = process.env.WEB_URL || "http://localhost:3000";
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(DL, { recursive: true });

let failed = 0;
function log(ok, msg, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${detail ? ` - ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();

async function exportVia(menuPage, itemText, expectExt, shot) {
  await page.goto(`${WEB}${menuPage}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Export/ }).click();
  await page.waitForTimeout(200);
  if (shot) await page.screenshot({ path: path.join(SHOTS, shot) });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.getByRole("menuitem", { name: new RegExp(itemText) }).click(),
  ]);
  const name = download.suggestedFilename();
  const target = path.join(DL, name);
  await download.saveAs(target);
  const size = fs.statSync(target).size;
  log(name.endsWith(expectExt) && size > 500, `${menuPage} ${itemText}`, `${name}, ${size} bytes`);
  return target;
}

try {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });

  await exportVia("/app/reports", "Report \\(PDF\\)", ".pdf", "v12-01-reports-export-menu.png");
  await exportVia("/app/reports", "Report data", ".csv");
  await exportVia("/app/leads", "Leads \\(CSV\\)", ".csv", "v12-02-leads-export-menu.png");
  await exportVia("/app/listings", "Listings \\(CSV\\)", ".csv", "v12-03-listings-export-menu.png");

  // Brochure from the listing drawer
  await page.goto(`${WEB}/app/listings`, { waitUntil: "networkidle" });
  await page.locator("button").filter({ hasText: /AED/ }).first().click();
  await page.waitForTimeout(500);
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 25000 }),
    page.getByRole("button", { name: /Download brochure/ }).click(),
  ]);
  const bt = path.join(DL, dl.suggestedFilename());
  await dl.saveAs(bt);
  log(fs.statSync(bt).size > 20000, "Brochure from listing drawer", `${dl.suggestedFilename()}, ${fs.statSync(bt).size} bytes`);

  // CSV content sanity
  const leadsCsv = fs.readFileSync(path.join(DL, fs.readdirSync(DL).find((f) => f.startsWith("leads"))), "utf8");
  log(leadsCsv.includes("Name,Phone,Email,Stage"), "Leads CSV header");
  log(!/[\u2013\u2014]/.test(leadsCsv), "No long dashes in CSV");
} catch (e) {
  failed++;
  console.log("FAIL  exception", e.message);
  await page.screenshot({ path: path.join(SHOTS, "v12-error.png") }).catch(() => {});
}
await browser.close();
console.log(failed ? `${failed} failed` : "ALL PASSED");
process.exit(failed ? 1 : 0);
