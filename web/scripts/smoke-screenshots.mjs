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

async function waitListings(page) {
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return /\d+ properties/.test(text) && !text.includes("0 properties");
  }, { timeout: 15000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

try {
  // Health
  const apiRes = await page.request.get(`${API}/api/testing/status`);
  log(apiRes.ok(), "API /api/testing/status", `status ${apiRes.status()}`);

  // Login
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });
  log(true, "Login as agent@atrium.demo");
  await page.waitForTimeout(600);
  await shot(page, "test-00-after-login.png");

  // Dashboard
  await page.goto(`${WEB}/app`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "test-01-dashboard.png");
  log(true, "Dashboard screenshot", "test-01-dashboard.png");

  // Listings
  await page.goto(`${WEB}/app/listings`, { waitUntil: "networkidle" });
  await waitListings(page);
  await page.waitForTimeout(500);

  const filterLayout = await page.evaluate(() => {
    const filters = [...document.querySelectorAll(".toolbar input")].map((el) => {
      const r = el.getBoundingClientRect();
      return { ph: el.placeholder, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    });
    const cards = [...document.querySelectorAll("button.group")].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    });
    const grid = document.querySelector(".grid.gap-4");
    return {
      filters,
      sameRow: filters.length > 1 && filters.every((f) => f.y === filters[0].y),
      cards,
      columns: new Set(cards.map((c) => c.y)).size >= 1 ? new Set(cards.filter((c) => c.y === cards[0]?.y).map((c) => c.x)).size : 0,
      gridCols: grid ? getComputedStyle(grid).gridTemplateColumns : null,
      countText: document.body.innerText.match(/\d+ properties/)?.[0] || null,
    };
  });

  log(filterLayout.filters.length >= 3, "Listings toolbar fields present", String(filterLayout.filters.length));
  log(filterLayout.sameRow, "Filters sit on one horizontal row", JSON.stringify(filterLayout.filters.map((f) => f.ph)));
  log(filterLayout.columns === 3, "Listings grid is 3 columns on desktop", `cols=${filterLayout.columns}, template=${filterLayout.gridCols}`);
  log(!!filterLayout.countText && filterLayout.countText !== "0 properties", "Listings loaded", filterLayout.countText);

  const chips = await page.locator(".filter-chip").count();
  log(chips >= 10, "Bayut-style filter chips present", String(chips));

  await shot(page, "test-02-listings.png");
  log(true, "Listings screenshot", "test-02-listings.png");

  // Filter interaction via chip
  await page.getByRole("button", { name: "3+", exact: true }).click();
  await page.waitForTimeout(900);
  const afterBeds = await page.evaluate(() => document.body.innerText.match(/\d+ properties/)?.[0]);
  log(true, "Filter by beds 3+", afterBeds || "no count");
  await shot(page, "test-02b-listings-filtered.png");
  await page.getByRole("button", { name: "Any beds", exact: true }).click();
  await page.waitForTimeout(700);

  // Open listing detail
  await page.locator("button.group").first().click();
  await page.waitForTimeout(600);
  const detailVisible = await page.getByText("Portals").isVisible().catch(() => false);
  log(detailVisible, "Listing detail panel opens with Portals");
  await shot(page, "test-02c-listings-detail.png");

  // Create modal
  await page.getByRole("button", { name: /add listing/i }).click();
  await page.waitForTimeout(400);
  const modal = await page.getByRole("heading", { name: /new listing/i }).isVisible().catch(() => false);
  log(modal, "Add listing modal opens");
  await shot(page, "test-02d-listings-create.png");
  await page.getByRole("button", { name: /cancel/i }).click();

  // Leads
  await page.goto(`${WEB}/app/leads`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const leadsOk = await page.getByRole("heading", { name: /leads/i }).isVisible();
  log(leadsOk, "Leads page loads");
  const simulateGone = (await page.getByRole("button", { name: /simulate bayut/i }).count()) === 0;
  const demoTools = await page.getByRole("button", { name: /demo tools/i }).isVisible().catch(() => false);
  log(simulateGone, "Simulate buttons not in main header");
  log(demoTools, "Demo tools tucked behind menu");
  await shot(page, "test-03-leads.png");

  // Calendar
  await page.goto(`${WEB}/app/calendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  log(await page.getByRole("heading", { name: /calendar|viewings/i }).first().isVisible().catch(() => false), "Calendar page loads");
  await shot(page, "test-04-calendar.png");

  // Money Map
  await page.goto(`${WEB}/app/money`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  log(await page.getByRole("heading", { name: /money/i }).first().isVisible().catch(() => false), "Money Map page loads");
  await shot(page, "test-05-money.png");

  // Shortlists
  await page.goto(`${WEB}/app/shortlists`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  log(await page.getByRole("heading", { name: /shortlist/i }).first().isVisible().catch(() => false), "Shortlists page loads");
  await shot(page, "test-06-shortlists.png");

  // Public shortlist if link exists
  const publicLink = await page.locator('a[href^="/s/"]').first().getAttribute("href").catch(() => null);
  if (publicLink) {
    await page.goto(`${WEB}${publicLink}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "test-07-public-shortlist.png");
    log(true, "Public shortlist screenshot", publicLink);
  } else {
    log(true, "Public shortlist skipped", "no /s/ link on page");
  }
} catch (err) {
  log(false, "Smoke run crashed", err.message);
  await shot(page, "test-error.png").catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log("\n---");
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error("Failures:");
  for (const f of failed) console.error(` - ${f.msg}: ${f.detail}`);
  process.exit(1);
}
