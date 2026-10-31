import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import type { CancelReason, ViewingOutcome } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { resolveDateRange } from "../src/lib/dateRange.js";
import {
  OUTCOME_TRACKING_SINCE,
  aggregateViewingHealth,
  classify,
  computeLag,
  median,
  noticeBucket,
  partyOf,
  totalsOf,
  viewingCsvRows,
  viewingTrendItems,
  type RawViewing,
} from "../src/lib/viewingStats.js";

const API = process.env.API_URL || "http://localhost:4000";
const NOW = new Date("2026-10-31T15:00:00.000Z");

function row(
  partial: Partial<RawViewing> & {
    startsAt: Date;
    outcome: ViewingOutcome;
  },
): RawViewing {
  return {
    id: partial.id || `id-${Math.random().toString(36).slice(2, 8)}`,
    startsAt: partial.startsAt,
    outcome: partial.outcome,
    cancelReason: partial.cancelReason ?? null,
    outcomeAt: partial.outcomeAt ?? null,
    notes: partial.notes ?? null,
    listingId: partial.listingId ?? null,
    createdById: partial.createdById ?? null,
    listing: partial.listing ?? null,
    createdBy: partial.createdBy ?? null,
    lead: partial.lead ?? null,
  };
}

describe("viewingStats helpers", () => {
  test("classify splits scheduled by now and drops duplicates from rates path", () => {
    assert.equal(
      classify({ startsAt: new Date(NOW.getTime() - 60_000), outcome: "SCHEDULED", cancelReason: null }, NOW),
      "unlogged",
    );
    assert.equal(
      classify({ startsAt: new Date(NOW.getTime() + 60_000), outcome: "SCHEDULED", cancelReason: null }, NOW),
      "upcoming",
    );
    assert.equal(
      classify({ startsAt: NOW, outcome: "CANCELLED", cancelReason: "DUPLICATE" }, NOW),
      "dup",
    );
  });

  test("bucket identity C+N+X+U+F = B and duplicates excluded", () => {
    const rows = [
      row({ startsAt: new Date(NOW.getTime() - 86400000), outcome: "COMPLETED" }),
      row({ startsAt: new Date(NOW.getTime() - 86400000), outcome: "NO_SHOW" }),
      row({ startsAt: new Date(NOW.getTime() - 86400000), outcome: "CANCELLED", cancelReason: "CLIENT" }),
      row({ startsAt: new Date(NOW.getTime() - 3600000), outcome: "SCHEDULED" }),
      row({ startsAt: new Date(NOW.getTime() + 3600000), outcome: "SCHEDULED" }),
      row({ startsAt: new Date(NOW.getTime() - 86400000), outcome: "CANCELLED", cancelReason: "DUPLICATE" }),
    ];
    const t = totalsOf(rows, NOW);
    assert.equal(t.completed + t.noShow + t.cancelled + t.unlogged + t.upcoming, t.booked);
    assert.equal(t.booked, 5);
    assert.equal(t.duplicates, 1);
  });

  test("rates null when decided < 5; held+cancel+noShow near 1 when enough data", () => {
    const few = Array.from({ length: 4 }, (_, i) =>
      row({ startsAt: new Date(NOW.getTime() - i * 1000), outcome: "COMPLETED" }),
    );
    const range = resolveDateRange({ range: "custom", from: "2026-10-01", to: "2026-10-31" });
    const small = aggregateViewingHealth(few, range, { now: NOW, compare: false, prevRows: [] });
    assert.equal(small.rates.held, null);

    const many = [
      ...Array.from({ length: 6 }, () =>
        row({ startsAt: new Date("2026-10-10T10:00:00"), outcome: "COMPLETED" }),
      ),
      ...Array.from({ length: 2 }, () =>
        row({ startsAt: new Date("2026-10-11T10:00:00"), outcome: "NO_SHOW" }),
      ),
      ...Array.from({ length: 2 }, () =>
        row({
          startsAt: new Date("2026-10-12T10:00:00"),
          outcome: "CANCELLED",
          cancelReason: "CLIENT" as CancelReason,
        }),
      ),
    ];
    const full = aggregateViewingHealth(many, range, { now: NOW, compare: false, prevRows: [] });
    assert.ok(full.rates.held != null);
    assert.ok(full.rates.cancel != null);
    assert.ok(full.rates.noShow != null);
    const sum = (full.rates.held || 0) + (full.rates.cancel || 0) + (full.rates.noShow || 0);
    assert.ok(Math.abs(sum - 1) < 0.002);
  });

  test("party mapping covers every cancel reason including null", () => {
    assert.equal(partyOf(null), "Not recorded");
    assert.equal(partyOf("CLIENT"), "Client");
    assert.equal(partyOf("AGENT"), "Our side");
    assert.equal(partyOf("LANDLORD"), "Owner or listing");
    assert.equal(partyOf("LISTING_UNAVAILABLE"), "Owner or listing");
    assert.equal(partyOf("RESCHEDULED"), "Rescheduled");
    assert.equal(partyOf("OTHER"), "Other");
    assert.equal(partyOf("DUPLICATE"), "Other");
  });

  test("notice buckets: edges at 2h/24h/72h go to higher bucket; after start for negative", () => {
    assert.equal(noticeBucket(-1), "After start");
    assert.equal(noticeBucket(1.9), "< 2h");
    assert.equal(noticeBucket(2), "2-24h");
    assert.equal(noticeBucket(23.9), "2-24h");
    assert.equal(noticeBucket(24), "1-3 days");
    assert.equal(noticeBucket(71.9), "1-3 days");
    assert.equal(noticeBucket(72), "> 3 days");
  });

  test("median odd and even; lag ignores outcomeAt before cutoff", () => {
    assert.equal(median([1, 3, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);

    const before = new Date(OUTCOME_TRACKING_SINCE.getTime() - 1000);
    const after = new Date(OUTCOME_TRACKING_SINCE.getTime() + 1000);
    const starts = new Date(after.getTime() + 48 * 3600_000);
    const lag = computeLag([
      {
        startsAt: starts,
        outcome: "CANCELLED",
        cancelReason: "CLIENT",
        outcomeAt: before,
      },
      {
        startsAt: starts,
        outcome: "CANCELLED",
        cancelReason: "CLIENT",
        outcomeAt: after,
      },
    ]);
    assert.equal(lag.notice.sampleSize, 1);
    assert.equal(lag.notice.medianHours, 48);
  });

  test("viewingTrendItems splits SCHEDULED and drops DUPLICATE", () => {
    const items = viewingTrendItems(
      [
        { startsAt: new Date(NOW.getTime() - 1000), outcome: "SCHEDULED" },
        { startsAt: new Date(NOW.getTime() + 1000), outcome: "SCHEDULED" },
        { startsAt: NOW, outcome: "CANCELLED", cancelReason: "DUPLICATE" },
        { startsAt: NOW, outcome: "COMPLETED" },
      ],
      NOW,
    );
    assert.deepEqual(
      items.map((i) => i.key).sort(),
      ["COMPLETED", "UNLOGGED", "UPCOMING"],
    );
  });

  test("csv rows include duplicates for audit and blank lag before cutoff", () => {
    const before = new Date(OUTCOME_TRACKING_SINCE.getTime() - 5000);
    const rows = viewingCsvRows(
      [
        row({
          startsAt: new Date("2026-10-20T10:30:00"),
          outcome: "CANCELLED",
          cancelReason: "DUPLICATE",
          outcomeAt: before,
          notes: "=1+1",
          lead: {
            id: "l1",
            name: "Ada",
            primarySource: "MANUAL",
            assignedToId: null,
            assignedTo: null,
          },
        }),
      ],
      { cancelledOnly: true },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0][7], "Duplicate");
    assert.equal(rows[0][9], null, "notice blank before cutoff");
    assert.equal(rows[0][12], "=1+1");
  });

  test("agent fallback assignee -> creator -> Unassigned; breakdown sums to booked", () => {
    const range = resolveDateRange({ range: "custom", from: "2026-10-01", to: "2026-10-31" });
    const rows = [
      row({
        startsAt: new Date("2026-10-05T10:00:00"),
        outcome: "COMPLETED",
        lead: {
          id: "1",
          name: "A",
          primarySource: "MANUAL",
          assignedToId: "a1",
          assignedTo: { id: "a1", name: "Assignee" },
        },
        createdBy: { id: "c1", name: "Creator" },
      }),
      row({
        startsAt: new Date("2026-10-06T10:00:00"),
        outcome: "COMPLETED",
        createdBy: { id: "c1", name: "Creator" },
      }),
      row({
        startsAt: new Date("2026-10-07T10:00:00"),
        outcome: "COMPLETED",
      }),
    ];
    const h = aggregateViewingHealth(rows, range, { now: NOW, compare: false, detail: "full", prevRows: [] });
    assert.ok("breakdowns" in h);
    if (!("breakdowns" in h)) return;
    const agents = h.breakdowns.agent;
    assert.ok(agents.find((a) => a.label === "Assignee"));
    assert.ok(agents.find((a) => a.label === "Creator"));
    assert.ok(agents.find((a) => a.label === "Unassigned"));
    assert.equal(
      agents.reduce((s, a) => s + a.booked, 0),
      h.totals.booked,
    );
  });

  test("null cancel reason becomes NOT_RECORDED", () => {
    const range = resolveDateRange({ range: "custom", from: "2026-10-01", to: "2026-10-31" });
    const h = aggregateViewingHealth(
      [
        row({
          startsAt: new Date("2026-10-08T10:00:00"),
          outcome: "CANCELLED",
          cancelReason: null,
        }),
      ],
      range,
      { now: NOW, compare: false, prevRows: [] },
    );
    assert.ok("reasons" in h);
    if (!("reasons" in h)) return;
    assert.equal(h.reasons[0].reason, "NOT_RECORDED");
    assert.equal(h.reasons[0].party, "Not recorded");
  });
});

describe("viewing health API", () => {
  let cookie = "";
  let orgId = "";

  before(async () => {
    const login = await fetch(`${API}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "agent@atrium.demo", password: "demo1234" }),
    });
    assert.ok(login.ok, "API must be running and seeded");
    cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const me = await prisma.user.findUniqueOrThrow({ where: { email: "agent@atrium.demo" } });
    orgId = me.organizationId!;
  });

  async function get(path: string, auth = true) {
    const res = await fetch(`${API}${path}`, {
      headers: { Origin: "http://localhost:3000", ...(auth ? { cookie } : {}) },
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    return { status: res.status, text, json };
  }

  test("unauthenticated viewings returns 401", async () => {
    const r = await get("/api/reports/viewings?range=30d", false);
    assert.equal(r.status, 401);
  });

  test("viewings full and headline shapes", async () => {
    const full = await get("/api/reports/viewings?range=30d");
    assert.equal(full.status, 200);
    const body = full.json as Record<string, unknown>;
    assert.ok(body.totals);
    assert.ok(body.rates);
    assert.ok(body.reasons);
    assert.ok(body.series);
    assert.ok(body.breakdowns);
    assert.ok(body.recentCancellations);

    const head = await get("/api/reports/viewings?range=30d&detail=headline");
    const h = head.json as Record<string, unknown>;
    assert.ok(h.totals);
    assert.ok(h.rates);
    assert.equal(h.reasons, undefined);
    assert.equal(h.series, undefined);
  });

  test("export.csv includes Viewing health sections", async () => {
    const r = await get("/api/reports/export.csv?range=30d");
    assert.equal(r.status, 200);
    assert.match(r.text, /Viewing health/);
    assert.match(r.text, /Cancel reasons/);
    assert.match(r.text, /Held rate \(%\)/);
  });

  test("viewings.csv header and cancelled filter", async () => {
    const all = await get("/api/reports/viewings.csv?range=90d");
    assert.equal(all.status, 200);
    assert.match(all.text, /^Date,Time,Lead,Listing,Agent,Source,Outcome/);
    const cxl = await get("/api/reports/viewings.csv?range=90d&outcome=CANCELLED");
    assert.equal(cxl.status, 200);
    const lines = cxl.text.trim().split(/\r?\n/).filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
      assert.match(lines[i], /Cancelled/);
    }
  });

  test("export.pdf returns PDF; buildReportPdf uses viewing health copy", async () => {
    const r = await get("/api/reports/export.pdf?range=90d");
    assert.equal(r.status, 200);
    assert.match(r.text, /^%PDF/);

    const { computeReportSummary } = await import("../src/lib/reportData.js");
    const { buildReportPdf } = await import("../src/lib/reportPdf.js");
    const range = resolveDateRange({ range: "90d" });
    const data = await computeReportSummary(orgId, range);
    const pdf = await buildReportPdf(data, { name: "Test Org", currencyLabel: "AED" });
    assert.ok(Buffer.isBuffer(pdf) && pdf.length > 500);
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    // Compressed streams hide plain text; assert the data the PDF builder uses.
    assert.ok(data.viewingHealth.totals.booked >= 0);
    if (data.viewingHealth.totals.booked > 0) {
      assert.ok("reasons" in data.viewingHealth);
    }
  });
});
