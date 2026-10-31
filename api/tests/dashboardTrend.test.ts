import "dotenv/config";
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { resolveDateRange } from "../src/lib/dateRange.js";
import {
  allowedGroups,
  buildTrend,
  makeSpans,
  pickGroup,
  summarize,
} from "../src/lib/trendBuckets.js";

const API = process.env.API_URL || "http://localhost:4000";
let cookie = "";
let orgId = "";

async function get(path: string, auth = true) {
  const res = await fetch(`${API}${path}`, {
    headers: { Origin: "http://localhost:3000", ...(auth ? { cookie } : {}) },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** A range of `len` days that ended yesterday, so other test files creating leads right now cannot change it. */
function past(len: number) {
  const to = new Date();
  to.setDate(to.getDate() - 1);
  const from = new Date(to);
  from.setDate(from.getDate() - (len - 1));
  return { from, to, qs: `range=custom&from=${key(from)}&to=${key(to)}` };
}

before(async () => {
  const login = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ email: "agent@atrium.demo", password: "demo1234" }),
  });
  assert.ok(login.ok, "login failed - is the API running and seeded?");
  cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const me = await prisma.user.findUniqueOrThrow({ where: { email: "agent@atrium.demo" } });
  orgId = me.organizationId!;
});

test("spans: day, week and month cover the range exactly once", () => {
  const from = new Date(2026, 0, 20);
  const to = new Date(2026, 3, 10);
  for (const g of ["day", "week", "month"] as const) {
    const spans = makeSpans(from, to, g);
    assert.equal(spans[0].start.getTime(), from.getTime());
    assert.equal(spans[spans.length - 1].end.getTime(), to.getTime());
    for (let i = 1; i < spans.length; i++) {
      const gap = spans[i].start.getTime() - spans[i - 1].end.getTime();
      assert.ok(gap > 0 && gap <= 25 * 3600 * 1000, `${g} spans must be contiguous`);
    }
  }
  assert.equal(makeSpans(from, to, "month").length, 4); // Jan (part), Feb, Mar, Apr (part)
});

test("spans: months are calendar months and partial ends are labelled", () => {
  const range = resolveDateRange({ range: "custom", from: "2026-01-20", to: "2026-03-10" });
  const b = buildTrend(range, "month", [], null, new Date(2026, 5, 1));
  assert.equal(b.length, 3);
  assert.match(b[0].title, /January 2026 \(20 to 31 Jan\)/);
  assert.equal(b[1].title, "February 2026");
  assert.match(b[2].title, /March 2026 \(1 to 10 Mar\)/);
});

test("group rules by range length", () => {
  assert.deepEqual(allowedGroups(7), ["day"]);
  assert.deepEqual(allowedGroups(30), ["day", "week"]);
  assert.deepEqual(allowedGroups(90), ["day", "week", "month"]);
  assert.deepEqual(allowedGroups(365), ["week", "month"]);
  assert.equal(pickGroup(undefined, 7), "day");
  assert.equal(pickGroup(undefined, 90), "week");
  assert.equal(pickGroup(undefined, 365), "month");
  assert.equal(pickGroup("day", 365), "month", "day is refused for a year, falls back to auto");
  assert.equal(pickGroup("month", 7), "day", "month is refused for a week");
  assert.equal(pickGroup("week", 90), "week");
});

test("buckets: counts, cumulative, breakdown, current marker and compare", () => {
  const range = resolveDateRange({ range: "custom", from: "2026-03-01", to: "2026-03-07" });
  const at = (d: number, h = 12) => new Date(2026, 2, d, h);
  const items = [
    { at: at(1), key: "BAYUT" },
    { at: at(1, 18), key: "BAYUT" },
    { at: at(1, 20), key: "MANUAL" },
    { at: at(4), key: "GUIDE" },
    { at: at(7, 23), key: "GUIDE" },
  ];
  const prev = [{ at: new Date(2026, 1, 26), key: "BAYUT" }];
  const b = buildTrend(range, "day", items, prev, new Date(2026, 2, 4, 9));
  assert.equal(b.length, 7);
  assert.deepEqual(
    b.map((x) => x.count),
    [3, 0, 0, 1, 0, 0, 1],
  );
  assert.deepEqual(
    b.map((x) => x.cumulative),
    [3, 3, 3, 4, 4, 4, 5],
  );
  assert.deepEqual(b[0].breakdown, [
    { key: "BAYUT", count: 2 },
    { key: "MANUAL", count: 1 },
  ]);
  assert.equal(b.filter((x) => x.isCurrent).length, 1);
  assert.ok(b[3].isCurrent);
  assert.equal(b[0].title, "Sunday, March 1, 2026");
  assert.deepEqual(
    b.map((x) => x.prev),
    [0, 0, 0, 0, 1, 0, 0],
    "previous period is Feb 22-28, the item is Feb 26 (index 4)",
  );
});

test("summarize: delta, average, peak, active buckets", () => {
  const range = resolveDateRange({ range: "custom", from: "2026-03-01", to: "2026-03-04" });
  const items = [
    { at: new Date(2026, 2, 2, 10) },
    { at: new Date(2026, 2, 2, 11) },
    { at: new Date(2026, 2, 4, 11) },
  ];
  const b = buildTrend(range, "day", items, null);
  const s = summarize(b, 2, 0);
  assert.equal(s.count, 3);
  assert.equal(s.deltaAbs, 1);
  assert.equal(s.deltaPct, 50);
  assert.equal(s.avgPerBucket, 0.8);
  assert.equal(s.activeBuckets, 2);
  assert.equal(s.peak?.count, 2);
  assert.equal(summarize(b, null, null).deltaPct, null);
  assert.equal(summarize(b, 0, 0).deltaPct, null, "no percentage from zero");
});

test("trend endpoint needs a session", async () => {
  const r = await get("/api/dashboard/trend", false);
  assert.equal(r.status, 401);
});

test("trend endpoint: defaults, shape and totals match the database", async () => {
  const shape = await get("/api/dashboard/trend?range=30d");
  assert.equal(shape.json.metric, "leads");
  assert.equal(shape.json.group, "day");
  assert.deepEqual(shape.json.allowedGroups, ["day", "week"]);
  assert.equal(shape.json.buckets.length, 30);
  assert.ok(shape.json.buckets.at(-1).isCurrent, "last bucket is today");
  assert.equal(shape.json.buckets.filter((b: any) => b.isCurrent).length, 1);

  const p = past(30);
  const r = await get(`/api/dashboard/trend?${p.qs}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.buckets.length, 30);
  const real = await prisma.lead.count({
    where: { organizationId: orgId, createdAt: { gte: new Date(p.from.setHours(0, 0, 0, 0)), lte: new Date(p.to.setHours(23, 59, 59, 999)) } },
  });
  assert.equal(r.json.totals.count, real);
  assert.equal(
    r.json.buckets.reduce((s: number, b: any) => s + b.count, 0),
    real,
  );
  assert.equal(r.json.buckets[r.json.buckets.length - 1].cumulative, real);
  assert.ok(real > 0, "demo history should have leads in the last 30 days");
});

test("trend endpoint: every grouping adds up to the same total", async () => {
  const totals: number[] = [];
  for (const g of ["day", "week", "month"]) {
    const r = await get(`/api/dashboard/trend?${past(90).qs}&group=${g}`);
    assert.equal(r.status, 200);
    assert.equal(r.json.group, g);
    totals.push(r.json.buckets.reduce((s: number, b: any) => s + b.count, 0));
    assert.equal(r.json.totals.count, totals.at(-1));
  }
  assert.equal(new Set(totals).size, 1, `totals differ: ${totals.join(",")}`);
});

test("trend endpoint: unavailable groupings fall back, long ranges work", async () => {
  const year = await get("/api/dashboard/trend?range=365d&group=day");
  assert.equal(year.status, 200);
  assert.equal(year.json.group, "month");
  assert.ok(year.json.buckets.length >= 12 && year.json.buckets.length <= 13);
  const week = await get("/api/dashboard/trend?range=7d&group=month");
  assert.equal(week.json.group, "day");
  const half = await get("/api/dashboard/trend?range=180d");
  assert.equal(half.json.group, "week");
});

test("trend endpoint: viewings and won metrics", async () => {
  const pv = past(90);
  const range = { from: new Date(pv.from.setHours(0, 0, 0, 0)), to: new Date(pv.to.setHours(23, 59, 59, 999)) };
  const v = await get(`/api/dashboard/trend?${pv.qs}&metric=viewings&group=week`);
  const realRows = await prisma.calendarEvent.findMany({
    where: { organizationId: orgId, type: "VIEWING", startsAt: { gte: range.from, lte: range.to } },
    select: { outcome: true, cancelReason: true },
  });
  const realV = realRows.filter((r) => !(r.outcome === "CANCELLED" && r.cancelReason === "DUPLICATE")).length;
  assert.equal(v.json.metric, "viewings");
  assert.equal(v.json.totals.count, realV);
  const allowed = new Set(["COMPLETED", "NO_SHOW", "CANCELLED", "UNLOGGED", "UPCOMING"]);
  for (const b of v.json.buckets) {
    for (const x of b.breakdown) {
      assert.ok(allowed.has(x.key), `unexpected breakdown key ${x.key}`);
      assert.notEqual(x.key, "SCHEDULED");
    }
  }
  const pw = past(365);
  const wr = { from: new Date(pw.from.setHours(0, 0, 0, 0)), to: new Date(pw.to.setHours(23, 59, 59, 999)) };
  const w = await get(`/api/dashboard/trend?${pw.qs}&metric=won`);
  const realW = await prisma.lead.findMany({
    where: { organizationId: orgId, stage: "WON", updatedAt: { gte: wr.from, lte: wr.to } },
    select: { dealValueAed: true },
  });
  assert.equal(w.json.totals.count, realW.length);
  assert.equal(
    w.json.totals.value,
    realW.reduce((s, l) => s + (l.dealValueAed ?? 0), 0),
  );
  const bad = await get("/api/dashboard/trend?metric=nonsense");
  assert.equal(bad.json.metric, "leads");
});

test("trend endpoint: compare adds the previous period", async () => {
  const off = await get("/api/dashboard/trend?range=30d");
  assert.equal(off.json.compare, false);
  assert.equal(off.json.totals.prevCount, null);
  assert.equal(off.json.buckets[0].prev, null);

  const pc = past(30);
  const on = await get(`/api/dashboard/trend?${pc.qs}&compare=1`);
  assert.equal(on.json.compare, true);
  const curFrom = new Date(pc.from.setHours(0, 0, 0, 0));
  const prevTo = new Date(curFrom.getTime() - 1);
  const prevFrom = new Date(curFrom);
  prevFrom.setDate(prevFrom.getDate() - 30);
  const realPrev = await prisma.lead.count({
    where: { organizationId: orgId, createdAt: { gte: prevFrom, lte: prevTo } },
  });
  assert.equal(on.json.totals.prevCount, realPrev);
  assert.equal(
    on.json.buckets.reduce((s: number, b: any) => s + (b.prev ?? 0), 0),
    realPrev,
  );
});

test("trend endpoint: custom range and breakdown labels", async () => {
  const from = new Date();
  from.setDate(from.getDate() - 40);
  const r = await get(`/api/dashboard/trend?range=custom&from=${key(from)}&to=${key(new Date())}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.range.preset, "custom");
  assert.equal(r.json.range.days, 41);
  assert.equal(r.json.group, "day");
  const withData = r.json.buckets.filter((b: any) => b.count > 0);
  for (const b of withData) {
    assert.equal(
      b.breakdown.reduce((s: number, x: any) => s + x.count, 0),
      b.count,
      "breakdown adds up to the bucket count",
    );
  }
});
