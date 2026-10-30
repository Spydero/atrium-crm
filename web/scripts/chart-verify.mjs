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
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function shot(page, name, clip) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false, ...(clip ? { clip } : {}) });
  return file;
}

async function chartBox(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".surface")];
    const card = nodes.find((n) => /New leads/i.test(n.textContent || ""));
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(r.x - 8)),
      y: Math.max(0, Math.round(r.y - 8)),
      width: Math.round(Math.min(r.width + 16, window.innerWidth - r.x + 8)),
      height: Math.round(Math.min(r.height + 16, window.innerHeight - r.y + 8)),
      text: (card.textContent || "").replace(/\s+/g, " ").trim().slice(0, 220),
    };
  });
}

async function readKpis(page) {
  return page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/dashboard/kpis`, { credentials: "include" });
    if (!res.ok) throw new Error(`kpis ${res.status}`);
    return res.json();
  }, API);
}

async function createLead(page, name, phone) {
  return page.evaluate(
    async ({ api, name, phone }) => {
      const stamp = Date.now();
      const res = await fetch(`${api}/api/leads`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: `chart-test-${stamp}@atrium.demo`,
          phone,
          dealValueAed: 2500000,
          primarySource: "MANUAL",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(JSON.stringify(body) || `create ${res.status}`);
      return body;
    },
    { api: API, name, phone },
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
let failed = 0;

try {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });
  log(true, "Logged in");

  await page.goto(`${WEB}/app`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=New leads", { timeout: 15000 });
  await page.waitForTimeout(900);

  const beforeKpis = await readKpis(page);
  const beforeChart = beforeKpis.newLeadsChart || [];
  const beforeToday = beforeChart[beforeChart.length - 1];
  const beforeWeek = beforeKpis.newLeadsWeek;

  log(
    Array.isArray(beforeChart) && beforeChart.length === 7,
    "Chart has 7 rolling days",
    JSON.stringify(beforeChart.map((d) => `${d.label}:${d.count}`)),
  );
  log(!!beforeChart[0]?.label, "Chart points expose date labels", beforeChart[0]?.label);
  log(
    beforeKpis.peakDay != null && typeof beforeKpis.peakDay.count === "number",
    "peakDay present",
    JSON.stringify(beforeKpis.peakDay),
  );

  const beforeBox = await chartBox(page);
  if (!beforeBox) {
    log(false, "Could not locate chart card");
    failed++;
  } else {
    await shot(page, "dash-chart-before.png", beforeBox);
    await shot(page, "dash-full-before.png");
    log(true, "Before screenshots", `week=${beforeWeek} today=${beforeToday?.label}:${beforeToday?.count}`);
  }

  // Create two leads with unique phones (Lead Fuse merges same phone)
  const stamp = String(Date.now()).slice(-7);
  const leadA = await createLead(page, "Chart Probe Alpha", `+97155${stamp}1`);
  const leadB = await createLead(page, "Chart Probe Beta", `+97155${stamp}2`);
  const idA = leadA?.id || leadA?.lead?.id;
  const idB = leadB?.id || leadB?.lead?.id;
  const fused = !!(leadA?.fused || leadB?.fused);
  log(!!idA && !!idB && !fused, "Created two distinct leads via API", `${idA}, ${idB}`);

  await page.getByRole("button", { name: /refresh/i }).click();
  await page.waitForTimeout(1200);

  const afterKpis = await readKpis(page);
  const afterChart = afterKpis.newLeadsChart || [];
  const afterToday = afterChart[afterChart.length - 1];
  const afterWeek = afterKpis.newLeadsWeek;

  const weekDelta = afterWeek - beforeWeek;
  const todayDelta = (afterToday?.count ?? 0) - (beforeToday?.count ?? 0);

  const weekOk = log(weekDelta === 2, "newLeadsWeek increased by 2", `${beforeWeek} → ${afterWeek} (Δ${weekDelta})`);
  const todayOk = log(
    todayDelta === 2,
    "Today's bar count increased by 2",
    `${beforeToday?.count} → ${afterToday?.count} (Δ${todayDelta})`,
  );
  if (!weekOk) failed++;
  if (!todayOk) failed++;

  log(
    true,
    "Chart series after",
    JSON.stringify(afterChart.map((d) => `${d.label}:${d.count}`)),
  );

  const afterBox = await chartBox(page);
  if (afterBox) {
    await shot(page, "dash-chart-after.png", afterBox);
    await shot(page, "dash-full-after.png");
    log(true, "After screenshots", afterBox.text);
  }

  // Visual: Recharts should render bars (rect) — not only an area path
  const viz = await page.evaluate(() => {
    const card = [...document.querySelectorAll(".surface")].find((n) =>
      /New leads/i.test(n.textContent || ""),
    );
    if (!card) return null;
    const bars = card.querySelectorAll(".recharts-bar-rectangle, .recharts-rectangle");
    const lines = card.querySelectorAll(".recharts-line-curve, .recharts-line path");
    const areas = card.querySelectorAll(".recharts-area");
    return {
      barCount: bars.length,
      lineCount: lines.length,
      areaCount: areas.length,
      hasPeak: /Peak/i.test(card.textContent || ""),
      hasAvg: /avg/i.test(card.textContent || ""),
      hasLegend: /Daily volume/i.test(card.textContent || ""),
    };
  });

  if (!viz) {
    log(false, "Chart DOM missing");
    failed++;
  } else {
    if (!log(viz.barCount >= 1, "Bar series rendered", `rects=${viz.barCount}`)) failed++;
    if (!log(viz.areaCount === 0, "Old area chart removed", `areas=${viz.areaCount}`)) failed++;
    if (!log(viz.lineCount >= 1, "Average line rendered", `paths=${viz.lineCount}`)) failed++;
    if (!log(viz.hasPeak, "Peak callout visible")) failed++;
    if (!log(viz.hasAvg, "Avg/day visible")) failed++;
    if (!log(viz.hasLegend, "Legend visible")) failed++;
  }
} catch (err) {
  failed++;
  log(false, "Chart verify crashed", err.message);
  await shot(page, "dash-chart-error.png").catch(() => {});
} finally {
  await browser.close();
}

console.log("\n———");
if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("All chart checks passed");
