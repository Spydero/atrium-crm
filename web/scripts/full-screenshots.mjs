import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../design/screenshots");
const WEB = process.env.WEB_URL || "http://localhost:3000";
const API = process.env.API_URL || "http://localhost:4000";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function log(ok, msg, detail = "") {
  results.push({ ok, msg, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${detail ? ` - ${detail}` : ""}`);
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

try {
  // Login
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });
  await page.waitForTimeout(700);
  await shot(page, "v11-00-login-dashboard.png");
  log(true, "Login + dashboard");

  // Nav groups
  const nav = (await page.locator("aside").innerText()).toUpperCase();
  for (const g of ["WORK", "INVENTORY", "INSIGHTS", "ADMIN"]) {
    log(nav.includes(g), `Sidebar group ${g}`);
  }

  // Dashboard chart
  await page.goto(`${WEB}/app`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=New leads", { timeout: 12000 });
  await page.waitForTimeout(700);
  await shot(page, "v11-01-dashboard.png");
  log(true, "Dashboard screenshot");

  // Leads
  await page.goto(`${WEB}/app/leads`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "v11-02-leads.png");
  log(await page.getByRole("heading", { name: /leads/i }).isVisible(), "Leads page");

  // Calendar
  await page.goto(`${WEB}/app/calendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "v11-03-calendar.png");
  log(true, "Calendar screenshot");

  // Listings grid
  await page.goto(`${WEB}/app/listings`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => /\d+ properties/.test(document.body.innerText),
    { timeout: 15000 },
  );
  await page.waitForTimeout(600);
  await shot(page, "v11-04-listings.png");
  log(true, "Listings grid");

  // Listing detail with map + brochure
  await page.locator("button.group").first().click();
  await page.waitForTimeout(1000);
  const hasMap = await page.getByText(/^Map$/i).first().isVisible().catch(() => false);
  const hasBrochure = await page
    .getByRole("button", { name: /download brochure/i })
    .isVisible();
  log(hasMap, "Listing detail shows Map section");
  log(hasBrochure, "Download brochure button visible");
  await shot(page, "v11-05-listing-detail-map.png");

  // Brochure download via API (cookie session)
  const brochureOk = await page.evaluate(async (api) => {
    const listRes = await fetch(`${api}/api/listings`, { credentials: "include" });
    const list = await listRes.json();
    const id = list[0]?.id;
    if (!id) return { ok: false, reason: "no listing" };
    const res = await fetch(`${api}/api/listings/${id}/brochure.pdf`, {
      credentials: "include",
    });
    const buf = await res.arrayBuffer();
    const head = String.fromCharCode(...new Uint8Array(buf).slice(0, 4));
    return { ok: res.ok && head === "%PDF", bytes: buf.byteLength, id };
  }, API);
  log(brochureOk.ok, "Brochure PDF downloads", `${brochureOk.bytes || 0} bytes`);

  // Create listing + place search
  await page.getByRole("button", { name: /add listing/i }).click();
  await page.waitForTimeout(400);
  const placeInput = page.getByPlaceholder(/search a real place/i);
  log(await placeInput.isVisible(), "Place search field on create");
  await placeInput.fill("Indiranagar Bangalore");
  await page.waitForTimeout(1200);
  const suggestion = page.locator('[role="listbox"] button').first();
  const hasSuggestion = await suggestion.isVisible().catch(() => false);
  log(hasSuggestion, "Place suggestions appear for Indiranagar");
  await shot(page, "v11-06-place-autocomplete.png");
  if (hasSuggestion) {
    await suggestion.click();
    await page.waitForTimeout(400);
    const pin = await page.getByText(/Pin /i).isVisible().catch(() => false);
    log(pin, "Selecting suggestion sets map pin");
  }
  await shot(page, "v11-07-place-selected.png");
  await page.getByRole("button", { name: /cancel/i }).click();

  // Places API sanity
  const places = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/places/search?q=Canary%20Wharf`, {
      credentials: "include",
    });
    const body = await res.json();
    return { status: res.status, n: body.results?.length || 0 };
  }, API);
  log(places.status === 200 && places.n > 0, "Places API", `${places.n} results`);

  // Shortlists
  await page.goto(`${WEB}/app/shortlists`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await shot(page, "v11-08-shortlists.png");
  log(true, "Shortlists screenshot");

  const publicLink = await page
    .locator('a[href^="/s/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (publicLink) {
    await page.goto(`${WEB}${publicLink}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await shot(page, "v11-09-public-shortlist-map.png");
    log(true, "Public shortlist screenshot", publicLink);
  } else {
    log(false, "Public shortlist link missing");
  }

  // Money Map
  await page.goto(`${WEB}/app/money`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await shot(page, "v11-10-money.png");
  log(true, "Money Map screenshot");

  // Reports
  await page.goto(`${WEB}/app/reports`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Leads by stage", { timeout: 12000 });
  await page.waitForTimeout(900);
  await shot(page, "v11-11-reports.png");
  log(true, "Reports screenshot");

  // Settings
  await page.goto(`${WEB}/app/settings`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Brokerage name", { timeout: 10000 });
  await page.waitForTimeout(500);
  await shot(page, "v11-12-settings.png");
  log(true, "Settings screenshot");

  // Crop: sidebar only
  const box = await page.locator("aside").boundingBox();
  if (box) {
    await page.screenshot({
      path: path.join(OUT, "v11-13-sidebar-groups.png"),
      clip: {
        x: Math.max(0, box.x),
        y: Math.max(0, box.y),
        width: Math.min(box.width + 8, 240),
        height: Math.min(box.height, 860),
      },
    });
    log(true, "Sidebar crop screenshot");
  }
} catch (err) {
  log(false, "Full screenshot run crashed", err.message);
  await shot(page, "v11-error.png").catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log("\n---");
console.log(`${results.length - failed.length}/${results.length} checks passed`);
console.log(`Screenshots in ${OUT}`);
if (failed.length) {
  for (const f of failed) console.error(` - ${f.msg}: ${f.detail}`);
  process.exit(1);
}
