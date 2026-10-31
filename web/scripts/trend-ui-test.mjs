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
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const card = () => page.getByTestId("trend-card");
const summary = () => page.getByTestId("trend-summary");

async function settle() {
  await page.waitForTimeout(700);
}
async function shot(name) {
  await settle();
  await card().screenshot({ path: path.join(SHOTS, name) });
}
async function pickRange(label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await settle();
}
// Zero-height bars are not drawn as rectangles, so read the bucket count from the summary line.
async function barCount() {
  const t = (await summary().innerText()).replace(/\s+/g, " ");
  const m = t.match(/of (\d+) (day|week|month)s active/);
  return m ? Number(m[1]) : -1;
}
async function drawn() {
  return page.locator('[data-testid="trend-plot"] .recharts-bar-rectangle').count();
}
async function hoverBar(i) {
  const bar = page.locator('[data-testid="trend-plot"] .recharts-bar-rectangle').nth(i);
  const box = await bar.boundingBox();
  const plot = await page.getByTestId("trend-plot").boundingBox();
  await page.mouse.move(box.x + box.width / 2, plot.y + plot.height / 2);
  await page.waitForTimeout(350);
}

try {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });
  await page.goto(`${WEB}/app`, { waitUntil: "networkidle" });
  await card().waitFor();
  await settle();

  // 1. Default view
  let n = await barCount();
  log(n === 7, "default 7d range has 7 day buckets", `${n} bars`);
  await shot("v15-01-trend-default.png");

  // 2. Range presets change the bars
  await pickRange("30d");
  n = await barCount();
  log(n === 30, "30d shows 30 day bars", `${n}`);
  const group30 = await page.getByRole("button", { name: "Day", exact: true }).getAttribute("aria-pressed");
  log(group30 === "true", "Day grouping is active for 30d");
  const weekBtn = page.getByRole("button", { name: "Week", exact: true });
  const monthBtn = page.getByRole("button", { name: "Month", exact: true });
  log(await weekBtn.isEnabled(), "Week is enabled for 30d");
  log(await monthBtn.isEnabled(), "Month is enabled too (never greyed out)");
  await shot("v15-02-trend-30d.png");

  // Picking Month on a short range widens the range to fit
  await page.getByRole("button", { name: "7d", exact: true }).click();
  await settle();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await settle();
  const m1 = (await summary().innerText()).replace(/\s+/g, " ");
  log(/by month|\/month/.test(m1) && /12 months/.test(m1), "Month on 7d jumps to a 12 month range", m1.slice(0, 110));
  log(
    (await page.getByRole("button", { name: "1y", exact: true }).first().getAttribute("class")).includes("bg-accent"),
    "the date filter above now shows 1y",
  );
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await settle();
  log(/\/week/.test((await summary().innerText()).replace(/\s+/g, " ")), "Week on a year works (same range)");
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await settle();
  const d1 = (await summary().innerText()).replace(/\s+/g, " ");
  log(/\/day/.test(d1) && (await barCount()) === 30, "Day on a year jumps to 30 days", d1.slice(0, 100));
  await page.getByRole("button", { name: "30d", exact: true }).click();
  await settle();

  // 3. Hover tooltip shows real details
  await pickRange("90d");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await settle();
  n = await barCount();
  log(n >= 13 && n <= 14, "90d grouped by week shows ~13 bars", `${n}`);
  const sum = (await summary().innerText()).replace(/\s+/g, " ");
  log(/leads?/.test(sum) && /avg [\d.]+\/week/.test(sum), "summary uses the week unit", sum.slice(0, 120));
  // find the tallest bar by trying a few
  let tip = "";
  const shown = await drawn();
  for (let i = shown - 1; i >= 0; i--) {
    await hoverBar(i);
    const t = page.locator(".recharts-tooltip-wrapper");
    tip = (await t.innerText().catch(() => "")).replace(/\s+/g, " ");
    if (/source/i.test(tip)) break;
  }
  log(/ to /.test(tip), "week tooltip names the date span", tip.slice(0, 60));
  log(/Share of period/.test(tip) && /Running total/.test(tip), "tooltip shows share and running total");
  log(/source/i.test(tip), "tooltip shows a source breakdown", tip.slice(-90));
  await page.screenshot({ path: path.join(SHOTS, "v15-03-trend-tooltip.png"), clip: await (async () => { const b = await card().boundingBox(); return { ...b, height: b.height + 40 }; })() });

  // 4. Click pins details
  const bars = page.locator('[data-testid="trend-plot"] .recharts-bar-rectangle');
  const last = (await bars.count()) - 1;
  await bars.nth(last).click();
  await settle();
  log(await page.getByTestId("trend-pinned").isVisible(), "clicking a bar pins its details");
  await bars.nth(last).click();
  await settle();
  log(!(await page.getByTestId("trend-pinned").isVisible().catch(() => false)), "clicking again unpins");
  await bars.nth(Math.max(0, last - 1)).click();
  await shot("v15-04-trend-pinned.png");

  // 5. Month grouping on 1y
  await pickRange("1y");
  n = await barCount();
  log(n >= 12 && n <= 13, "1y defaults to monthly bars", `${n}`);
  log(await page.getByRole("button", { name: "Day", exact: true }).isEnabled(), "Day is still clickable on 1y");
  const sumY = (await summary().innerText()).replace(/\s+/g, " ");
  log(/avg [\d.]+\/month/.test(sumY), "summary uses the month unit", sumY.slice(0, 120));
  await shot("v15-05-trend-1y-month.png");

  // 5b. Sort by
  await pickRange("30d");
  const firstTick = async () =>
    (await page.locator('[data-testid="trend-plot"] .recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value').first().textContent()).trim();
  const peakLabel = (await summary().innerText()).match(/Peak (.+?) ·/)?.[1]?.trim();
  const dateFirst = await firstTick();
  await page.getByRole("button", { name: "Highest", exact: true }).click();
  await settle();
  log((await firstTick()) === peakLabel, "Sort Highest puts the peak first", `${await firstTick()} vs peak ${peakLabel}`);
  log(/highest first/i.test(await page.locator('[data-testid="trend-card"]').innerText()), "header says highest first");
  await shot("v15-10-trend-sorted-high.png");
  await page.getByRole("button", { name: "Lowest", exact: true }).click();
  await settle();
  log((await firstTick()) !== peakLabel, "Sort Lowest puts the peak elsewhere", await firstTick());
  await page.getByRole("button", { name: "Date", exact: true }).click();
  await settle();
  log((await firstTick()) === dateFirst, "Sort Date restores chronological order", await firstTick());

  // 6. Compare
  await pickRange("30d");
  await page.getByText("Compare to previous").click();
  await settle();
  const delta = await page.getByTestId("trend-delta").innerText();
  log(/vs previous 30 days/.test(delta), "compare shows change vs previous 30 days", delta.replace(/\s+/g, " "));
  log((await page.locator('[data-testid="trend-plot"] .recharts-line').count()) >= 2, "previous period line is drawn");
  await shot("v15-06-trend-compare.png");

  // 7. Other metrics
  await page.getByRole("button", { name: "Viewings", exact: true }).click();
  await pickRange("90d");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await settle();
  const vs = (await summary().innerText()).replace(/\s+/g, " ");
  log(/viewings?/.test(vs), "viewings metric summary", vs.slice(0, 100));
  await shot("v15-07-trend-viewings.png");

  await page.getByRole("button", { name: "Deals won", exact: true }).click();
  await pickRange("1y");
  await settle();
  const ws = (await summary().innerText()).replace(/\s+/g, " ");
  log(/deals? won/.test(ws), "deals won metric summary", ws.slice(0, 100));
  await shot("v15-08-trend-won.png");

  // 8. Custom range
  await page.getByRole("button", { name: "New leads", exact: true }).click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  const from = new Date();
  from.setDate(from.getDate() - 20);
  const key = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.locator('input[type="date"]').first().fill(key(from));
  await settle();
  n = await barCount();
  log(n === 21, "custom range of 21 days shows 21 bars", `${n}`);

  // 9. Dashboard KPIs still intact
  await page.getByRole("button", { name: "7d", exact: true }).click();
  await settle();
  for (const t of ["Open leads", "Pipeline by stage", "Lead sources", "Upcoming viewings", "Needs attention"]) {
    log(await page.getByText(t, { exact: false }).first().isVisible(), `dashboard still shows ${t}`);
  }
  await page.screenshot({ path: path.join(SHOTS, "v15-09-dashboard-full.png"), fullPage: true });

  log(errors.length === 0, "no page errors", errors.join("; ").slice(0, 200));
} catch (e) {
  failed++;
  console.log("FAIL  exception", e.message);
  await page.screenshot({ path: path.join(SHOTS, "v15-error.png") }).catch(() => {});
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
