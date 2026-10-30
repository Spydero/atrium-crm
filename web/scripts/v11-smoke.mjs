import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../design/screenshots");
const WEB = process.env.WEB_URL || "http://localhost:3000";
const API = process.env.API_URL || "http://localhost:4000";
fs.mkdirSync(OUT, { recursive: true });

function log(ok, msg, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${detail ? ` - ${detail}` : ""}`);
  return ok;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
let failed = 0;

try {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });
  log(true, "Login");

  // Places API
  const places = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/places/search?q=Canary%20Wharf`, {
      credentials: "include",
    });
    const body = await res.json();
    return { status: res.status, n: body.results?.length || 0, first: body.results?.[0]?.label };
  }, API);
  if (!log(places.status === 200 && places.n > 0, "Nominatim place search", `${places.n} hits; ${places.first}`))
    failed++;

  // Reports API
  const reports = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/reports/summary`, { credentials: "include" });
    const body = await res.json();
    return { status: res.status, stages: body.leadsByStage?.length, agents: body.agentLeaderboard?.length };
  }, API);
  if (!log(reports.status === 200 && reports.stages === 6, "Reports summary", JSON.stringify(reports)))
    failed++;

  // Settings
  const settings = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/settings`, { credentials: "include" });
    return { status: res.status, ...(await res.json()) };
  }, API);
  if (!log(settings.status === 200 && settings.currencyLabel, "Settings load", settings.currencyLabel))
    failed++;

  // Brochure PDF
  const listingId = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/listings`, { credentials: "include" });
    const list = await res.json();
    return list[0]?.id;
  }, API);
  const brochure = await page.evaluate(
    async ({ api, id }) => {
      const res = await fetch(`${api}/api/listings/${id}/brochure.pdf`, {
        credentials: "include",
      });
      const buf = await res.arrayBuffer();
      const head = String.fromCharCode(...new Uint8Array(buf).slice(0, 4));
      return { status: res.status, bytes: buf.byteLength, head };
    },
    { api: API, id: listingId },
  );
  if (
    !log(
      brochure.status === 200 && brochure.head === "%PDF" && brochure.bytes > 500,
      "Brochure PDF",
      `${brochure.bytes} bytes`,
    )
  )
    failed++;

  // Listing has coords from seed
  const withCoords = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/listings`, { credentials: "include" });
    const list = await res.json();
    return list.filter((l) => l.lat != null && l.lng != null).length;
  }, API);
  if (!log(withCoords >= 1, "Seed listings have map coords", String(withCoords))) failed++;

  // UI pages + nav groups (labels render uppercase via CSS)
  await page.goto(`${WEB}/app/settings`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /settings/i }).waitFor({ timeout: 10000 });
  const navText = (await page.locator("aside").innerText()).toUpperCase();
  for (const label of ["WORK", "INVENTORY", "INSIGHTS", "ADMIN"]) {
    if (!log(navText.includes(label), `Nav group ${label}`)) failed++;
  }

  await page.goto(`${WEB}/app/reports`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  if (!log(await page.getByRole("heading", { name: /reports/i }).isVisible(), "Reports page"))
    failed++;
  await page.screenshot({ path: path.join(OUT, "test-08-reports.png") });

  await page.goto(`${WEB}/app/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  if (!log(await page.getByRole("heading", { name: /settings/i }).isVisible(), "Settings page"))
    failed++;
  await page.screenshot({ path: path.join(OUT, "test-09-settings.png") });

  await page.goto(`${WEB}/app/listings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.locator("button.group").first().click();
  await page.waitForTimeout(800);
  const mapOk = await page.getByText(/Map/i).first().isVisible().catch(() => false);
  const brochureBtn = await page.getByRole("button", { name: /download brochure/i }).isVisible();
  if (!log(mapOk, "Listing detail Map section")) failed++;
  if (!log(brochureBtn, "Download brochure button")) failed++;
  await page.screenshot({ path: path.join(OUT, "test-10-listing-map.png") });

  await page.getByRole("button", { name: /add listing/i }).click();
  await page.waitForTimeout(400);
  const placeSearch = await page.getByPlaceholder(/search a real place/i).last().isVisible();
  if (!log(placeSearch, "PlaceInput on create modal")) failed++;
  await page.screenshot({ path: path.join(OUT, "test-11-listing-create-place.png") });
} catch (err) {
  failed++;
  log(false, "V1.1 smoke crashed", err.message);
  await page.screenshot({ path: path.join(OUT, "test-v11-error.png") }).catch(() => {});
} finally {
  await browser.close();
}

console.log("\n---");
if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("All V1.1 checks passed");
