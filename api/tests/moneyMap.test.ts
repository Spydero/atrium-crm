import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "../src/lib/prisma.js";
import { resolveDateRange } from "../src/lib/dateRange.js";
import {
  computeMoneyMap,
  cueFor,
  deltaOf,
  monthKey,
  monthStart,
  resolveSpendForRange,
} from "../src/lib/moneyStats.js";
import { SYSTEM_CHANNELS } from "../src/lib/channels.js";

const API = process.env.API_URL || "http://localhost:4000";

async function login() {
  const res = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ email: "agent@atrium.demo", password: "demo1234" }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  return cookie;
}

describe("money map helpers", () => {
  test("resolveSpendForRange carry-forward and proration", () => {
    const entries = [{ source: "meta", month: monthStart("2026-08"), amount: 3100 }];
    const r = resolveSpendForRange(entries, "meta", {
      from: new Date(2026, 9, 1),
      to: new Date(2026, 9, 15, 23, 59, 59, 999),
    });
    assert.equal(r.status, "entered");
    assert.equal(r.spend, Math.round((3100 / 31) * 15));
    assert.equal(r.partial, false);
  });

  test("resolveSpendForRange none vs zero", () => {
    const none = resolveSpendForRange([], "guide", {
      from: new Date(2026, 9, 1),
      to: new Date(2026, 9, 10),
    });
    assert.equal(none.status, "none");
    assert.equal(none.spend, null);

    const zero = resolveSpendForRange(
      [{ source: "referral", month: monthStart("2026-10"), amount: 0 }],
      "referral",
      { from: new Date(2026, 9, 1), to: new Date(2026, 9, 10) },
    );
    assert.equal(zero.status, "zero");
    assert.equal(zero.spend, 0);
  });

  test("deltaOf inverts better for costs", () => {
    const d = deltaOf(800, 1000, true);
    assert.ok(d);
    assert.equal(d.direction, "better");
    assert.equal(d.pct, -20);
  });

  test("cue ADD_SPEND and ORGANIC", () => {
    assert.equal(
      cueFor(
        {
          spend: null,
          spendStatus: "none",
          spendPartial: false,
          leads: 3,
          viewings: 0,
          wins: 0,
          sharedWins: 0,
          wonValue: 0,
          costPerViewing: null,
          costPerWin: null,
          leadToViewingPct: null,
          viewingToWinPct: null,
        },
        1000,
        5000,
        90,
      ).kind,
      "ADD_SPEND",
    );
    assert.equal(
      cueFor(
        {
          spend: 0,
          spendStatus: "zero",
          spendPartial: false,
          leads: 20,
          viewings: 5,
          wins: 1,
          sharedWins: 0,
          wonValue: 1,
          costPerViewing: null,
          costPerWin: null,
          leadToViewingPct: 0.2,
          viewingToWinPct: 0.2,
        },
        1000,
        5000,
        90,
      ).kind,
      "ORGANIC",
    );
  });

  test("system channels include guide", () => {
    assert.ok(SYSTEM_CHANNELS.some((c) => c.key === "guide"));
    assert.ok(SYSTEM_CHANNELS.some((c) => c.key === "manual"));
  });
});

describe("money map API + compute", () => {
  let cookie = "";
  let orgId = "";

  before(async () => {
    cookie = await login();
    const org = await prisma.organization.findFirstOrThrow({ where: { slug: "levante-demo" } });
    orgId = org.id;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  test("computeMoneyMap: at risk is deduped and ignores WON/LOST", async () => {
    const range = resolveDateRange({ range: "90d" });
    const m = await computeMoneyMap(orgId, range);
    assert.ok(m.atRisk.leads <= m.atRisk.items);
    for (const row of m.atRisk.list) {
      assert.notEqual(row.stage, "WON");
      assert.notEqual(row.stage, "LOST");
    }
    const sum = m.atRisk.list.reduce((s, l) => s + (l.dealValue ?? 0), 0);
    assert.equal(m.atRisk.value, sum);
  });

  test("computeMoneyMap: guide appears and missing spend is flagged", async () => {
    const range = resolveDateRange({ range: "90d" });
    const m = await computeMoneyMap(orgId, range);
    const guide = m.rows.find((r) => r.source === "guide");
    assert.ok(guide);
    if (guide!.leads > 0) {
      assert.equal(guide!.spendStatus, "none");
      assert.ok(m.callouts.missingSpend.includes("guide"));
    }
  });

  test("GET /api/money/map needs auth and accepts 90d", async () => {
    assert.equal((await fetch(`${API}/api/money/map`)).status, 401);
    const res = await fetch(`${API}/api/money/map?range=90d`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.attribution, "all_touch");
    assert.equal(body.range.days, 90);
    assert.ok(Array.isArray(body.rows));
    assert.ok(body.rows.some((r: { source: string }) => r.source === "guide"));
    assert.ok(body.channels?.length > 0);
    assert.ok(body.totals);
    assert.ok(body.atRisk);
  });

  test("attribution=first is rejected", async () => {
    const res = await fetch(`${API}/api/money/map?range=30d&attribution=first`, {
      headers: { cookie },
    });
    assert.equal(res.status, 400);
  });

  test("spend GET/PUT round trip and clear", async () => {
    const month = monthKey(new Date());
    const put = await fetch(`${API}/api/money/spend`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        month,
        entries: [{ source: "whatsapp", amount: 1234 }],
      }),
    });
    assert.equal(put.status, 200);
    const after = await put.json();
    const row = after.rows.find((r: { source: string }) => r.source === "whatsapp");
    assert.equal(row.amount, 1234);
    assert.equal(row.inherited, false);

    const clear = await fetch(`${API}/api/money/spend`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        month,
        entries: [{ source: "whatsapp", amount: null }],
      }),
    });
    assert.equal(clear.status, 200);
    const cleared = (await clear.json()).rows.find((r: { source: string }) => r.source === "whatsapp");
    assert.equal(cleared.amount, null);

    const bad = await fetch(`${API}/api/money/spend`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ month, entries: [{ source: "meta", amount: -1 }] }),
    });
    assert.equal(bad.status, 400);
  });

  test("stage WON sets wonAt; leaving WON clears it", async () => {
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        name: "Money Map Win Probe",
        email: `money-win-${Date.now()}@example.com`,
        stage: "OFFER",
        primarySource: "manual",
      },
    });
    const patch = await fetch(`${API}/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ stage: "WON", dealValueAed: 100000 }),
    });
    assert.equal(patch.status, 200);
    const won = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    assert.ok(won.wonAt);

    const back = await fetch(`${API}/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ stage: "OFFER" }),
    });
    assert.equal(back.status, 200);
    const cleared = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    assert.equal(cleared.wonAt, null);

    await prisma.lead.delete({ where: { id: lead.id } });
  });
});
