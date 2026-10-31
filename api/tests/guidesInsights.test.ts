import "dotenv/config";
import test, { before } from "node:test";
import assert from "node:assert/strict";

const API = process.env.API_URL || "http://localhost:4000";
let cookie = "";

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
/** A range that ended yesterday so guide tests creating requests right now cannot change it. */
function past(len: number) {
  const to = new Date();
  to.setDate(to.getDate() - 1);
  const from = new Date(to);
  from.setDate(from.getDate() - (len - 1));
  return `range=custom&from=${key(from)}&to=${key(to)}`;
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
});

const sum = (rows: any[], f: (r: any) => number) => rows.reduce((a, r) => a + f(r), 0);

test("library numbers add up: totals, rows, channels and the gated/open split", async () => {
  const r = await get(`/api/guides?${past(60)}`);
  assert.equal(r.status, 200);
  const rows = r.json.guides.map((g: any) => g.stats).filter(Boolean);
  const t = r.json.totals;
  assert.equal(t.views, sum(rows, (x) => x.views));
  assert.equal(t.requests, sum(rows, (x) => x.requests));
  assert.equal(t.newDownloads, sum(rows, (x) => x.newDownloads));
  assert.equal(t.gatedViews + t.openViews, t.views, "every view is either form first or open");
  assert.equal(sum(r.json.channels, (c) => c.requests), t.requests, "channels add up to requests");
  assert.ok(t.views > 0 && t.requests > 0, "demo data present");
  for (const c of r.json.channels) {
    assert.ok(c.downloaded <= c.requests && c.reachedViewing <= c.leads);
  }
  assert.ok(r.json.previous && typeof r.json.previous.views === "number", "previous period totals are returned");
  assert.equal(r.json.filters.active, false);
  assert.equal(r.json.filters.shown, r.json.filters.total);
});

test("conversion means request rate for form-first guides and download rate for open ones", async () => {
  const r = await get(`/api/guides?${past(60)}`);
  for (const g of r.json.guides) {
    if (!g.stats) continue;
    if (g.gated) {
      assert.equal(g.stats.conversionKind, "request");
      assert.equal(g.stats.conversionRate, g.stats.views ? Math.round((g.stats.requests / g.stats.views) * 1000) / 1000 : 0);
    } else {
      assert.equal(g.stats.conversionKind, "download");
      assert.equal(
        g.stats.conversionRate,
        g.stats.views ? Math.round((g.stats.newDownloads / g.stats.views) * 1000) / 1000 : 0,
      );
    }
  }
  const t = r.json.totals;
  const gatedRequests = sum(
    r.json.guides.filter((g: any) => g.gated && g.stats),
    (g) => g.stats.requests,
  );
  assert.equal(t.requestRate, t.gatedViews ? Math.round((gatedRequests / t.gatedViews) * 1000) / 1000 : 0);
});

test("filters: search, status, audience and access narrow the list and the totals", async () => {
  const all = await get(`/api/guides?${past(60)}`);
  const total = all.json.guides.length;

  const pub = await get(`/api/guides?${past(60)}&status=PUBLISHED`);
  assert.ok(pub.json.guides.length > 0 && pub.json.guides.length < total);
  assert.ok(pub.json.guides.every((g: any) => g.status === "PUBLISHED"));
  assert.equal(pub.json.filters.active, true);
  assert.equal(pub.json.filters.total, total);
  assert.equal(pub.json.filters.shown, pub.json.guides.length);
  assert.equal(
    pub.json.totals.views,
    sum(pub.json.guides, (g) => g.stats.views),
    "totals follow the filter",
  );

  const open = await get(`/api/guides?${past(60)}&access=open`);
  assert.ok(open.json.guides.length >= 1 && open.json.guides.every((g: any) => g.gated === false));
  assert.equal(open.json.totals.gatedViews, 0);

  const gated = await get(`/api/guides?${past(60)}&access=gated`);
  assert.ok(gated.json.guides.every((g: any) => g.gated === true));
  assert.equal(gated.json.totals.openViews, 0);

  const buyers = await get(`/api/guides?${past(60)}&audience=BUYER`);
  assert.ok(buyers.json.guides.length >= 1 && buyers.json.guides.every((g: any) => g.audience === "BUYER"));

  const search = await get(`/api/guides?${past(60)}&q=INVESTOR`);
  assert.ok(search.json.guides.length >= 1);
  assert.ok(search.json.guides.every((g: any) => /investor/i.test(`${g.title} ${g.summary}`)), "search is case insensitive");

  const none = await get(`/api/guides?${past(60)}&q=zzzz-no-such-guide`);
  assert.equal(none.status, 200);
  assert.equal(none.json.guides.length, 0);
  assert.equal(none.json.totals.views, 0);
  assert.equal(none.json.channels.length, 0);

  const both = await get(`/api/guides?${past(60)}&status=PUBLISHED&access=open`);
  assert.ok(both.json.guides.every((g: any) => g.status === "PUBLISHED" && g.gated === false));

  const junk = await get(`/api/guides?${past(60)}&status=NOPE&audience=NOPE&access=NOPE`);
  assert.equal(junk.json.guides.length, total, "unknown filter values are ignored");
  assert.equal(junk.json.filters.active, false);
});

test("sort: by views, requests, title, direction, and an unknown key falls back", async () => {
  const views = await get(`/api/guides?${past(60)}&sort=views`);
  const v = views.json.guides.map((g: any) => g.stats.views);
  assert.deepEqual(v, [...v].sort((a, b) => b - a), "views high to low by default");
  assert.equal(views.json.sort.key, "views");
  assert.equal(views.json.sort.dir, "desc");

  const asc = await get(`/api/guides?${past(60)}&sort=views&dir=asc`);
  const va = asc.json.guides.map((g: any) => g.stats.views);
  assert.deepEqual(va, [...va].sort((a, b) => a - b), "low to high with dir=asc");

  const req = await get(`/api/guides?${past(60)}&sort=requests`);
  const rq = req.json.guides.map((g: any) => g.stats.requests);
  assert.deepEqual(rq, [...rq].sort((a, b) => b - a));

  const conv = await get(`/api/guides?${past(60)}&sort=conversion`);
  const cv = conv.json.guides.map((g: any) => g.stats.conversionRate);
  assert.deepEqual(cv, [...cv].sort((a, b) => b - a));

  const title = await get(`/api/guides?${past(60)}&sort=title`);
  const names = title.json.guides.map((g: any) => g.title);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), "titles A to Z by default");
  const titleDesc = await get(`/api/guides?${past(60)}&sort=title&dir=desc`);
  assert.deepEqual(
    titleDesc.json.guides.map((g: any) => g.title),
    [...names].sort((a, b) => b.localeCompare(a)),
  );

  const status = await get(`/api/guides?${past(60)}`);
  assert.equal(status.json.sort.key, "status");
  const order = status.json.guides.map((g: any) => g.status);
  const rank = { PUBLISHED: 0, DRAFT: 1, ARCHIVED: 2 } as Record<string, number>;
  assert.deepEqual(order, [...order].sort((a, b) => rank[a] - rank[b]));

  const bad = await get(`/api/guides?${past(60)}&sort=drop-table`);
  assert.equal(bad.json.sort.key, "status");
});

test("trend: views, requests and downloads match the library numbers", async () => {
  const lib = await get(`/api/guides?${past(60)}`);
  for (const [metric, expected] of [
    ["views", lib.json.totals.views],
    ["requests", lib.json.totals.requests],
    ["downloads", lib.json.totals.newDownloads],
  ] as const) {
    const t = await get(`/api/guides/trend?${past(60)}&metric=${metric}`);
    assert.equal(t.status, 200);
    assert.equal(t.json.metric, metric);
    assert.equal(t.json.totals.count, expected, `${metric} chart total equals the card`);
    assert.equal(sum(t.json.buckets, (b) => b.count), expected);
    for (const b of t.json.buckets.filter((x: any) => x.count > 0)) {
      assert.equal(sum(b.breakdown, (x) => x.count), b.count, "breakdown adds up to the bucket");
    }
  }
});

test("trend: every grouping adds up, filters apply, compare matches the previous period", async () => {
  const totals: number[] = [];
  for (const g of ["day", "week", "month"]) {
    const t = await get(`/api/guides/trend?${past(90)}&metric=views&group=${g}`);
    assert.equal(t.json.group, g);
    totals.push(t.json.totals.count);
  }
  assert.equal(new Set(totals).size, 1, `totals differ: ${totals.join(",")}`);

  const filtered = await get(`/api/guides/trend?${past(60)}&metric=views&access=open`);
  const lib = await get(`/api/guides?${past(60)}&access=open`);
  assert.equal(filtered.json.totals.count, lib.json.totals.views, "trend follows the same filters as the list");

  const none = await get(`/api/guides/trend?${past(60)}&metric=views&q=zzzz-no-such-guide`);
  assert.equal(none.json.totals.count, 0);

  const cmp = await get(`/api/guides/trend?${past(60)}&metric=requests&compare=1`);
  const base = await get(`/api/guides?${past(60)}`);
  assert.equal(cmp.json.totals.prevCount, base.json.previous.requests, "previous period matches the library comparison");
});

test("trend and library need a session", async () => {
  assert.equal((await get("/api/guides/trend", false)).status, 401);
  assert.equal((await get("/api/guides", false)).status, 401);
});
