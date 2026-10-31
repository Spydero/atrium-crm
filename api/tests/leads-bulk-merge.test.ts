import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";

const API = process.env.API_URL || "http://localhost:4000";
let cookie = "";
let orgId = "";
const createdLeadIds: string[] = [];
let otherOrgId = "";
let otherLeadId = "";
let otherUserId = "";

// 7 random digits per run so phones never collide with seed data or earlier runs
const run = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
let counter = 0;
function nextDigits() {
  counter += 1;
  return `${run.slice(0, 6)}${counter}`; // 7 digits
}

async function call(path: string, init: RequestInit = {}, auth = true) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...(auth ? { cookie } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json };
}

/** Create a lead through the API. `format` controls how the phone is written. */
async function makeLead(opts: {
  name: string;
  format?: "intl" | "local";
  digits?: string;
  email?: string;
  stage?: string;
  source?: string;
}) {
  const digits = opts.digits ?? nextDigits();
  const phone = opts.format === "local" ? `050${digits}` : `+97150${digits}`;
  const r = await call("/api/leads", {
    method: "POST",
    body: JSON.stringify({
      name: opts.name,
      phone,
      email: opts.email,
      primarySource: opts.source ?? "manual",
    }),
  });
  assert.equal(r.status, 201, `create lead failed: ${JSON.stringify(r.json)}`);
  const id = r.json.lead.id as string;
  createdLeadIds.push(id);
  if (opts.stage && opts.stage !== "NEW") {
    const p = await call(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify({ stage: opts.stage }) });
    assert.equal(p.status, 200);
  }
  return { id, phone, digits };
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

  // A second organization to prove tenant isolation
  const other = await prisma.organization.create({
    data: { name: `Test Other Org ${run}`, slug: `test-other-${run}` },
  });
  otherOrgId = other.id;
  const otherUser = await prisma.user.create({
    data: {
      name: "Outsider",
      email: `outsider-${run}@example.com`,
      organizationId: other.id,
    },
  });
  otherUserId = otherUser.id;
  const otherLead = await prisma.lead.create({
    data: {
      organizationId: other.id,
      name: "Other Org Lead",
      phone: `+97155${run}`,
    },
  });
  otherLeadId = otherLead.id;
});

after(async () => {
  await prisma.calendarEvent.deleteMany({ where: { leadId: { in: createdLeadIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: [...createdLeadIds, otherLeadId] } } });
  await prisma.user.deleteMany({ where: { id: otherUserId } });
  await prisma.organization.deleteMany({ where: { id: otherOrgId } });
  await prisma.$disconnect();
});

test("endpoints require authentication", async () => {
  for (const [method, path] of [
    ["GET", "/api/leads/agents"],
    ["GET", "/api/leads/duplicates"],
    ["GET", "/api/leads/compare?ids=a,b"],
    ["POST", "/api/leads/bulk"],
    ["POST", "/api/leads/merge"],
  ] as const) {
    const r = await call(path, { method, body: method === "POST" ? "{}" : undefined }, false);
    assert.equal(r.status, 401, `${method} ${path} should be 401, got ${r.status}`);
  }
});

test("GET /agents lists only my organization's team", async () => {
  const r = await call("/api/leads/agents");
  assert.equal(r.status, 200);
  const names = r.json.map((u: any) => u.name);
  assert.ok(names.includes("Omar Hassan"));
  assert.ok(names.includes("Sara Al Maktoum"));
  assert.ok(!names.includes("Outsider"));
});

test("bulk stage change updates many leads and logs activity", async () => {
  const a = await makeLead({ name: "Bulk A" });
  const b = await makeLead({ name: "Bulk B" });
  const c = await makeLead({ name: "Bulk C", stage: "QUALIFIED" });

  const r = await call("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ action: "stage", ids: [a.id, b.id, c.id], stage: "QUALIFIED" }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.updated, 2, "C was already QUALIFIED");
  assert.equal(r.json.unchanged, 1);

  for (const id of [a.id, b.id, c.id]) {
    const d = await call(`/api/leads/${id}`);
    assert.equal(d.json.stage, "QUALIFIED");
  }
  const detail = await call(`/api/leads/${a.id}`);
  assert.ok(
    detail.json.activities.some((x: any) => x.type === "stage" && /bulk/.test(x.body)),
    "bulk stage change should be logged",
  );
});

test("bulk stage change is idempotent", async () => {
  const a = await makeLead({ name: "Idem A" });
  const body = JSON.stringify({ action: "stage", ids: [a.id], stage: "OFFER" });
  const first = await call("/api/leads/bulk", { method: "POST", body });
  const second = await call("/api/leads/bulk", { method: "POST", body });
  assert.equal(first.json.updated, 1);
  assert.equal(second.json.updated, 0);
  const detail = await call(`/api/leads/${a.id}`);
  const stageEvents = detail.json.activities.filter((x: any) => x.type === "stage");
  assert.equal(stageEvents.length, 1, "no duplicate activity on a no-op");
});

test("bulk validates input", async () => {
  const a = await makeLead({ name: "Valid A" });
  const badStage = await call("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ action: "stage", ids: [a.id], stage: "BOGUS" }),
  });
  assert.equal(badStage.status, 400);
  const noIds = await call("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ action: "stage", ids: [], stage: "NEW" }),
  });
  assert.equal(noIds.status, 400);
  const badAction = await call("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ action: "delete", ids: [a.id] }),
  });
  assert.equal(badAction.status, 400);
  const unknown = await call("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ action: "stage", ids: [a.id, "does-not-exist"], stage: "WON" }),
  });
  assert.equal(unknown.status, 404);
  const untouched = await call(`/api/leads/${a.id}`);
  assert.equal(untouched.json.stage, "NEW", "a failed bulk call must not change anything");
});

test("bulk cannot touch another organization's leads", async () => {
  const r = await call("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ action: "stage", ids: [otherLeadId], stage: "WON" }),
  });
  assert.equal(r.status, 404);
  const row = await prisma.lead.findUniqueOrThrow({ where: { id: otherLeadId } });
  assert.equal(row.stage, "NEW");
});

test("bulk assign and unassign", async () => {
  const a = await makeLead({ name: "Own A" });
  const b = await makeLead({ name: "Own B" });
  const team = (await call("/api/leads/agents")).json as { id: string; name: string }[];
  const sara = team.find((u) => u.name === "Sara Al Maktoum")!;

  const assign = await call("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ action: "assign", ids: [a.id, b.id], assignedToId: sara.id }),
  });
  assert.equal(assign.status, 200);
  assert.equal(assign.json.updated, 2);
  assert.equal(assign.json.assignedTo.name, "Sara Al Maktoum");
  assert.equal((await call(`/api/leads/${a.id}`)).json.assignedTo.name, "Sara Al Maktoum");

  const again = await call("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ action: "assign", ids: [a.id, b.id], assignedToId: sara.id }),
  });
  assert.equal(again.json.updated, 0);

  const un = await call("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ action: "unassign", ids: [a.id, b.id] }),
  });
  assert.equal(un.json.updated, 2);
  assert.equal((await call(`/api/leads/${a.id}`)).json.assignedTo, null);
  const detail = await call(`/api/leads/${a.id}`);
  assert.ok(detail.json.activities.some((x: any) => x.type === "assigned" && /Unassigned/.test(x.body)));
});

test("bulk assign rejects an agent from another organization", async () => {
  const a = await makeLead({ name: "Own C" });
  const r = await call("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ action: "assign", ids: [a.id], assignedToId: otherUserId }),
  });
  assert.equal(r.status, 400);
});

test("duplicates: finds same number written two ways and ignores distinct leads", async () => {
  const digits = nextDigits();
  const intl = await makeLead({ name: "Dup Intl", digits, format: "intl" });
  const local = await makeLead({ name: "Dup Local", digits, format: "local" });
  const solo = await makeLead({ name: "Not A Dup" });

  const r = await call("/api/leads/duplicates");
  assert.equal(r.status, 200);
  const group = r.json.groups.find((g: any) => g.leads.some((l: any) => l.id === intl.id));
  assert.ok(group, "group for the two formats should exist");
  assert.deepEqual(group.leads.map((l: any) => l.id).sort(), [intl.id, local.id].sort());
  assert.ok(group.reasons.includes("phone"));
  assert.ok(!r.json.groups.some((g: any) => g.leads.some((l: any) => l.id === solo.id)));
  assert.equal(r.json.count, r.json.groups.length);
});

test("duplicates: finds same email with different phones", async () => {
  const email = `same-${run}@example.com`;
  const a = await makeLead({ name: "Mail A", email });
  const b = await makeLead({ name: "Mail B", email: email.toUpperCase().replace("@EXAMPLE.COM", "@example.com") });
  const r = await call("/api/leads/duplicates");
  const group = r.json.groups.find((g: any) => g.leads.some((l: any) => l.id === a.id));
  assert.ok(group);
  assert.ok(group.leads.some((l: any) => l.id === b.id));
  assert.ok(group.reasons.includes("email"));
});

test("duplicates: suggests the most advanced lead as primary", async () => {
  const digits = nextDigits();
  const early = await makeLead({ name: "Suggest Early", digits, format: "intl" });
  const late = await makeLead({ name: "Suggest Late", digits, format: "local", stage: "OFFER" });
  const r = await call("/api/leads/duplicates");
  const group = r.json.groups.find((g: any) => g.leads.some((l: any) => l.id === early.id));
  assert.equal(group.suggestedPrimaryId, late.id);
});

test("compare validates the number of leads and org scope", async () => {
  const a = await makeLead({ name: "Cmp A" });
  const b = await makeLead({ name: "Cmp B" });
  assert.equal((await call(`/api/leads/compare?ids=${a.id}`)).status, 400);
  assert.equal((await call(`/api/leads/compare?ids=${a.id},${otherLeadId}`)).status, 404);
  const ok = await call(`/api/leads/compare?ids=${a.id},${b.id}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.leads.length, 2);
  assert.ok(ok.json.suggestedPrimaryId);
});

test("merge moves sources, notes, activity and calendar events to the kept lead", async () => {
  const digits = nextDigits();
  const keep = await makeLead({ name: "Keep Me", digits, format: "intl", source: "bayut" });
  const dup = await makeLead({
    name: "Merge Me",
    digits,
    format: "local",
    source: "property_finder",
    email: `fill-${run}@example.com`,
  });

  // History on the duplicate
  const note = await call(`/api/leads/${dup.id}/notes`, {
    method: "POST",
    body: JSON.stringify({ body: "Wants a sea view" }),
  });
  assert.equal(note.status, 201);
  const ev = await call("/api/calendar", {
    method: "POST",
    body: JSON.stringify({
      title: "Viewing for dup",
      type: "VIEWING",
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      leadId: dup.id,
    }),
  });
  assert.ok([200, 201].includes(ev.status), `calendar create failed ${ev.status}`);

  const before = await call(`/api/leads/${keep.id}`);
  assert.equal(before.json.email, null);

  const r = await call("/api/leads/merge", {
    method: "POST",
    body: JSON.stringify({ primaryId: keep.id, duplicateIds: [dup.id] }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.merged, 1);
  assert.equal(r.json.moved.sources, 1);
  assert.equal(r.json.moved.notes, 1);
  assert.equal(r.json.moved.events, 1);

  // Duplicate is gone
  assert.equal((await call(`/api/leads/${dup.id}`)).status, 404);

  // Kept lead has everything
  const after = (await call(`/api/leads/${keep.id}`)).json;
  assert.equal(after.name, "Keep Me");
  assert.equal(after.phone, keep.phone, "primary phone wins");
  assert.equal(after.email, `fill-${run}@example.com`, "blank email filled from duplicate");
  assert.equal(after.sources.length, 2);
  assert.deepEqual([...new Set(after.sources.map((s: any) => s.source))].sort(), ["bayut", "property_finder"]);
  assert.ok(after.notes.some((n: any) => n.body === "Wants a sea view"));
  assert.ok(
    after.notes.some((n: any) => /Merged from duplicate lead "Merge Me"/.test(n.body) && n.body.includes(dup.phone)),
    "the duplicate's phone is preserved in a note",
  );
  assert.ok(after.activities.some((a: any) => a.type === "merge"));
  assert.ok(after.events.some((e: any) => e.title === "Viewing for dup"), "calendar event moved");
});

test("merge handles several duplicates at once", async () => {
  const digits = nextDigits();
  const keep = await makeLead({ name: "Multi Keep", digits, format: "intl" });
  const d1 = await makeLead({ name: "Multi D1", digits, format: "local" });
  const d2 = await makeLead({ name: "Multi D2", email: `multi-${run}@example.com` });
  const r = await call("/api/leads/merge", {
    method: "POST",
    body: JSON.stringify({ primaryId: keep.id, duplicateIds: [d1.id, d2.id] }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.merged, 2);
  assert.equal((await call(`/api/leads/${d1.id}`)).status, 404);
  assert.equal((await call(`/api/leads/${d2.id}`)).status, 404);
  const kept = (await call(`/api/leads/${keep.id}`)).json;
  assert.equal(kept.sources.length, 3);
  assert.equal(kept.email, `multi-${run}@example.com`);
});

test("merge keeps the chosen lead's stage and takes the earliest created date", async () => {
  const digits = nextDigits();
  const older = await makeLead({ name: "Older", digits, format: "intl" });
  const newer = await makeLead({ name: "Newer", digits, format: "local", stage: "OFFER" });
  const olderRow = await prisma.lead.findUniqueOrThrow({ where: { id: older.id } });

  const r = await call("/api/leads/merge", {
    method: "POST",
    body: JSON.stringify({ primaryId: newer.id, duplicateIds: [older.id] }),
  });
  assert.equal(r.status, 200);
  const kept = await prisma.lead.findUniqueOrThrow({ where: { id: newer.id } });
  assert.equal(kept.stage, "OFFER");
  assert.equal(kept.createdAt.getTime(), olderRow.createdAt.getTime());
});

test("merge validates input and org scope, and changes nothing on failure", async () => {
  const a = await makeLead({ name: "Safe A" });
  const b = await makeLead({ name: "Safe B" });

  const self = await call("/api/leads/merge", {
    method: "POST",
    body: JSON.stringify({ primaryId: a.id, duplicateIds: [a.id] }),
  });
  assert.equal(self.status, 400);

  const none = await call("/api/leads/merge", {
    method: "POST",
    body: JSON.stringify({ primaryId: a.id, duplicateIds: [] }),
  });
  assert.equal(none.status, 400);

  const cross = await call("/api/leads/merge", {
    method: "POST",
    body: JSON.stringify({ primaryId: a.id, duplicateIds: [b.id, otherLeadId] }),
  });
  assert.equal(cross.status, 404);
  assert.equal((await call(`/api/leads/${b.id}`)).status, 200, "b must still exist");
  assert.ok(await prisma.lead.findUnique({ where: { id: otherLeadId } }), "other org lead must still exist");

  const crossPrimary = await call("/api/leads/merge", {
    method: "POST",
    body: JSON.stringify({ primaryId: otherLeadId, duplicateIds: [a.id] }),
  });
  assert.equal(crossPrimary.status, 404);
  assert.equal((await call(`/api/leads/${a.id}`)).status, 200);
});

test("merged duplicates disappear from the duplicate list", async () => {
  const digits = nextDigits();
  const keep = await makeLead({ name: "Gone Keep", digits, format: "intl" });
  const dup = await makeLead({ name: "Gone Dup", digits, format: "local" });
  let r = await call("/api/leads/duplicates");
  assert.ok(r.json.groups.some((g: any) => g.leads.some((l: any) => l.id === keep.id)));
  await call("/api/leads/merge", {
    method: "POST",
    body: JSON.stringify({ primaryId: keep.id, duplicateIds: [dup.id] }),
  });
  r = await call("/api/leads/duplicates");
  assert.ok(!r.json.groups.some((g: any) => g.leads.some((l: any) => l.id === keep.id)));
});

test("seeded demo leads are not flagged as duplicates", async () => {
  const r = await call("/api/leads/duplicates");
  const seedNames = ["Khalid Al Mansoori", "Priya Sharma", "James Whitfield", "Fatima Noor", "Closed Deal Co."];
  for (const g of r.json.groups) {
    for (const l of g.leads) {
      assert.ok(!seedNames.includes(l.name) || g.leads.length < 2, `seed lead ${l.name} wrongly grouped`);
    }
  }
  assert.ok(orgId);
});
