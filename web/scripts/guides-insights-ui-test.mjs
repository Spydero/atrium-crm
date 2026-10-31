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
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const settle = (ms = 700) => page.waitForTimeout(ms);
const cards = () => page.locator("[data-testid=guide-card]");
const count = async () => (await page.getByTestId("guide-count").innerText()).trim();
const stat = async (label) => (await page.getByTestId(`stat-${label}`).innerText()).replace(/\s+/g, " ");
const viewsOf = async () =>
  (await cards().allInnerTexts()).map((t) => Number((t.match(/(\d+)\s*\n?\s*views/) || [])[1] ?? -1));
const summary = () => page.getByTestId("trend-summary");

try {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });
  await page.goto(`${WEB}/app/guides`, { waitUntil: "networkidle" });
  await cards().first().waitFor();
  await settle();

  // 1. Numbers on the cards make sense
  const views = await stat("Page views");
  const downloads = await stat("Downloads");
  log(/form first/.test(views) && /open/.test(views), "Page views card splits form-first and open", views);
  log(/open/.test(downloads) && /of requests opened/.test(downloads), "Downloads card explains where they come from", downloads);
  log((await page.getByTestId("delta").count()) >= 4, "cards show change vs the previous period");
  log(/vs previous 30 days/.test(await page.getByTestId("delta").first().innerText()), "delta names the comparison period");
  const req = await stat("Requests");
  log(/of form-first views/.test(req), "request rate is measured against form-first views only", req);

  // 2. Cards show the right conversion label per guide
  const texts = await cards().allInnerTexts();
  const open = texts.find((t) => /open download/i.test(t));
  const gated = texts.find((t) => /form first/i.test(t));
  log(open && /download rate/.test(open) && !/request rate/.test(open), "open guide shows download rate, no request count");
  log(gated && /request rate/.test(gated) && /requests/.test(gated), "form-first guide shows request rate");

  // 3. Trend chart on this page
  log(await page.getByTestId("trend-card").isVisible(), "Guides page has the trend chart");
  for (const m of ["Page views", "Requests", "Downloads"]) {
    log(await page.getByTestId("trend-card").getByRole("button", { name: m, exact: true }).isVisible(), `chart metric tab: ${m}`);
  }
  const sv = (await summary().innerText()).replace(/\s+/g, " ");
  log(/page views?/.test(sv) && /avg [\d.]+\/day/.test(sv), "chart summary for page views", sv.slice(0, 100));
  await page.getByTestId("trend-card").getByRole("button", { name: "Requests", exact: true }).click();
  await settle();
  const sr = (await summary().innerText()).replace(/\s+/g, " ");
  log(/requests?/.test(sr), "switching the chart to Requests works", sr.slice(0, 80));
  await page.getByTestId("trend-card").getByRole("button", { name: "Month", exact: true }).click();
  await settle();
  log(/\/month/.test((await summary().innerText()).replace(/\s+/g, " ")), "Month grouping works here too (range moved to fit)");
  log(
    (await page.getByRole("button", { name: "1y", exact: true }).first().getAttribute("class")).includes("bg-accent"),
    "date filter followed to 1y",
  );
  await page.getByRole("button", { name: "30d", exact: true }).click();
  await settle();
  await page.getByTestId("trend-card").screenshot({ path: path.join(SHOTS, "v16-02-guides-trend.png") });

  // 4. Filters
  const total = await count();
  log(/Showing 7 of 7 guides/.test(total), "count starts at 7 of 7", total);
  await page.getByLabel("Status", { exact: true }).selectOption("PUBLISHED");
  await settle();
  const c1 = await count();
  const n1 = await cards().count();
  log(/Showing \d+ of 7/.test(c1) && n1 < 7 && n1 >= 4, "Status filter narrows the list", `${c1}, ${n1} cards`);
  log((await cards().allInnerTexts()).every((t) => /published/i.test(t)), "only published guides remain");
  await page.getByLabel("Access", { exact: true }).selectOption("open");
  await settle();
  const n2 = await cards().count();
  log(n2 >= 1 && n2 < n1, "Access filter narrows further", `${n2} cards`);
  log(/open download/i.test(await cards().first().innerText()), "remaining guide is open download");
  log(/0 form first/.test(await stat("Page views")) || /^.*0 form first/.test(await stat("Page views")), "totals follow the filters", await stat("Page views"));
  await page.screenshot({ path: path.join(SHOTS, "v16-03-guides-filtered.png"), fullPage: false });
  await page.getByRole("button", { name: "Clear filters" }).click();
  await settle();
  log(/Showing 7 of 7/.test(await count()), "Clear filters restores everything");

  await page.getByLabel("Search guides").fill("investor");
  await settle(900);
  const ns = await cards().count();
  log(ns >= 1 && ns < 7, "Search narrows the list", `${ns} cards`);
  log((await cards().allInnerTexts()).every((t) => /investor/i.test(t)), "every result mentions investor");
  await page.getByLabel("Search guides").fill("zzzz-no-such-guide");
  await settle(900);
  log((await page.getByText("No guides match these filters").isVisible()), "empty state for no matches");
  log(/\b0\b/.test(await stat("Page views")), "totals drop to zero with no matches", await stat("Page views"));
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await settle();

  // 5. Sort
  await page.getByLabel("Sort guides by").selectOption("views");
  await settle();
  let v = await viewsOf();
  log(v.length >= 5 && v.every((x, i) => i === 0 || v[i - 1] >= x), "Sort by page views, high to low", v.join(", "));
  await page.getByRole("button", { name: /Sort direction/ }).click();
  await settle();
  v = await viewsOf();
  log(v.every((x, i) => i === 0 || v[i - 1] <= x), "Flip direction: low to high", v.join(", "));
  await page.getByLabel("Sort guides by").selectOption("title");
  await settle();
  const titles = (await cards().locator("h2").allInnerTexts()).map((t) => t.trim());
  log(titles.every((t, i) => i === 0 || titles[i - 1].localeCompare(t) <= 0), "Sort by title A to Z", titles.slice(0, 3).join(" | "));
  await page.getByLabel("Sort guides by").selectOption("requests");
  await settle();
  await page.screenshot({ path: path.join(SHOTS, "v16-04-guides-sorted.png") });
  await page.getByLabel("Sort guides by").selectOption("status");
  await settle();

  // 6. Channels are detailed
  const ch = (await page.getByTestId("channels").innerText()).replace(/\s+/g, " ");
  log(/downloaded/.test(ch) && /reached viewing/.test(ch) && /\d+%/.test(ch), "channel panel shows share, downloaded, leads, viewings", ch.slice(0, 140));

  // 7. Date range changes everything together
  const before = await stat("Requests");
  await page.getByRole("button", { name: "7d", exact: true }).click();
  await settle(900);
  log(before !== (await stat("Requests")), "7d range changes the cards", `${before} -> ${await stat("Requests")}`);
  log(/last 7 days/i.test((await summary().innerText())) || /7 days|LAST 7/i.test(await page.getByTestId("trend-card").innerText()), "and the chart");
  await page.getByRole("button", { name: "30d", exact: true }).click();
  await settle();

  await page.screenshot({ path: path.join(SHOTS, "v16-01-guides-overview.png"), fullPage: true });
  log(errors.length === 0, "no page errors", errors.join("; ").slice(0, 200));
} catch (e) {
  failed++;
  console.log("FAIL  exception", e.message);
  await page.screenshot({ path: path.join(SHOTS, "v16-error.png") }).catch(() => {});
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
