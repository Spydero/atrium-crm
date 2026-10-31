import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "../src/lib/prisma.js";
import { ensureOrgChannels, SYSTEM_CHANNELS } from "../src/lib/channels.js";

const API = process.env.API_URL || "http://localhost:4000";
const run = Date.now().toString(36);

async function login() {
  const res = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ email: "agent@atrium.demo", password: "demo1234" }),
  });
  assert.equal(res.status, 200, "login failed - is the API running and seeded?");
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  return cookie;
}

describe("org channels", () => {
  let cookie = "";
  let orgId = "";
  let freshOrgId = "";
  const createdLeadIds: string[] = [];
  const customKey = `local_ads_${run}`;

  before(async () => {
    cookie = await login();
    const me = await prisma.user.findUniqueOrThrow({ where: { email: "agent@atrium.demo" } });
    orgId = me.organizationId!;
  });

  after(async () => {
    if (createdLeadIds.length) {
      await prisma.leadSourceEvent.deleteMany({ where: { leadId: { in: createdLeadIds } } });
      await prisma.activityEvent.deleteMany({ where: { leadId: { in: createdLeadIds } } });
      await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
    }
    await prisma.orgChannel.deleteMany({ where: { organizationId: orgId, key: customKey } });
    if (freshOrgId) {
      await prisma.orgChannel.deleteMany({ where: { organizationId: freshOrgId } });
      await prisma.organization.delete({ where: { id: freshOrgId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("fresh org gets system channels only", async () => {
    const org = await prisma.organization.create({
      data: { name: `Fresh ${run}`, slug: `fresh-channels-${run}` },
    });
    freshOrgId = org.id;
    await ensureOrgChannels(org.id);
    const keys = (
      await prisma.orgChannel.findMany({ where: { organizationId: org.id }, orderBy: { sortOrder: "asc" } })
    ).map((c) => c.key);
    assert.deepEqual(
      keys,
      SYSTEM_CHANNELS.map((c) => c.key),
    );
    assert.ok(!keys.includes("bayut"));
    assert.ok(!keys.includes("meta"));
  });

  test("settings lists channels and allows custom CRUD", async () => {
    const list = await fetch(`${API}/api/settings/channels`, {
      headers: { cookie, Origin: "http://localhost:3000" },
    });
    assert.equal(list.status, 200);
    const body = await list.json();
    assert.ok(Array.isArray(body.channels));
    assert.ok(body.channels.some((c: { key: string }) => c.key === "manual"));

    const created = await fetch(`${API}/api/settings/channels`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ label: "Local Ads", key: customKey, kind: "ADS" }),
    });
    assert.equal(created.status, 201);
    const ch = await created.json();
    assert.equal(ch.key, customKey);
    assert.equal(ch.label, "Local Ads");
    assert.equal(ch.enabled, true);

    const renamed = await fetch(`${API}/api/settings/channels/${customKey}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ label: "Local Classifieds" }),
    });
    assert.equal(renamed.status, 200);
    assert.equal((await renamed.json()).label, "Local Classifieds");

    const delSystem = await fetch(`${API}/api/settings/channels/manual`, {
      method: "DELETE",
      headers: { cookie, Origin: "http://localhost:3000" },
    });
    assert.equal(delSystem.status, 400);
  });

  test("log enquiry uses enabled channel and fuses on phone", async () => {
    const phone = `+97150${String(Date.now()).slice(-7)}`;
    const first = await fetch(`${API}/api/leads/enquiries`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({
        name: "Channel Test A",
        phone,
        source: customKey,
      }),
    });
    assert.ok([200, 201].includes(first.status), `first enquiry status ${first.status}`);
    const a = await first.json();
    assert.equal(a.fused, false);
    assert.equal(a.lead.primarySource, customKey);
    createdLeadIds.push(a.lead.id);

    const second = await fetch(`${API}/api/leads/enquiries`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({
        name: "Channel Test B",
        phone,
        source: "manual",
      }),
    });
    assert.ok([200, 201].includes(second.status), `fuse enquiry status ${second.status}`);
    const b = await second.json();
    assert.equal(b.fused, true);
    assert.equal(b.lead.id, a.lead.id);
    const sources = b.lead.sources.map((s: { source: string }) => s.source).sort();
    assert.deepEqual(sources, [customKey, "manual"].sort());
  });

  test("disabled channel rejects enquiry", async () => {
    await fetch(`${API}/api/settings/channels/${customKey}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ enabled: false }),
    });
    const bad = await fetch(`${API}/api/leads/enquiries`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({
        name: "Should Fail",
        phone: `+97155${String(Date.now()).slice(-7)}`,
        source: customKey,
      }),
    });
    assert.equal(bad.status, 400);
  });

  test("money map rows use org catalog labels", async () => {
    const res = await fetch(`${API}/api/money/map?range=30d`, {
      headers: { cookie, Origin: "http://localhost:3000" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.channels));
    assert.ok(body.channels.some((c: { key: string }) => c.key === "manual"));
    assert.ok(body.rows.every((r: { label?: string }) => typeof r.label === "string" && r.label.length > 0));
  });
});
