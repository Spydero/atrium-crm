import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { createUserWithPassword } from "../src/lib/createUserAccount.js";
import { computeReportSummary } from "../src/lib/reportData.js";
import { resolveDateRange } from "../src/lib/dateRange.js";

const API = process.env.API_URL || "http://localhost:4000";
const tag = `security-${randomUUID()}`;
const password = "Regression-only-123!";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAA00lEQVR4nAHIADf/AAAHDhMaISYtNDlAR0xTWl9mbXJ5gIWMkwAXHiUqMTg9REtQV15janF2fYSJkJeco6oALjU8QUhPVFtiZ251eoGIjZSboKeus7rBAEVMU1hfZmtyeX6FjJGYn6Srsre+xcrR2ABcY2pvdn2CiZCVnKOor7a7wsnO1dzh6O8Ac3qBho2UmaCnrLO6v8bN0tng5ezz+P8GAIqRmJ2kq7C3vsPK0dbd5Onw9/wDCg8WHQChqK+0u8LHztXa4ejt9PsABw4TGiEmLTR4xmSBIxtb6gAAAABJRU5ErkJggg==", "base64");

describe("CRM security regressions (isolated brokerages)", () => {
  let orgA = "", orgB = "", userA = "", userB = "", listingA = "", listingB = "", leadId = "", cookie = "";
  let guideSlug = "", guideToken = "", shortlistToken = "";
  const uploadedNames: string[] = [];

  async function api(route: string, method = "GET", body?: unknown) {
    return fetch(`${API}${route}`, {
      method,
      headers: { cookie, Origin: "http://localhost:3000", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  before(async () => {
    orgA = (await prisma.organization.create({ data: { name: tag, slug: `${tag}-a` } })).id;
    orgB = (await prisma.organization.create({ data: { name: tag, slug: `${tag}-b` } })).id;
    userA = (await createUserWithPassword({ name: tag, email: `${tag}-a@example.com`, password, role: "broker", organizationId: orgA })).id;
    userB = (await createUserWithPassword({ name: tag, email: `${tag}-b@example.com`, password, role: "broker", organizationId: orgB })).id;
    const listing = { title: tag, priceAed: 100000, community: "Regression" };
    listingA = (await prisma.listing.create({ data: { ...listing, organizationId: orgA } })).id;
    listingB = (await prisma.listing.create({ data: { ...listing, organizationId: orgB } })).id;
    leadId = (await prisma.lead.create({ data: { organizationId: orgA, name: tag, phone: "+971500001234", assignedToId: userA } })).id;
    const guide = await prisma.guide.create({ data: { organizationId: orgA, title: tag, slug: tag, status: "PUBLISHED", gated: false } });
    guideSlug = guide.slug;
    guideToken = (await prisma.guideRequest.create({ data: { guideId: guide.id, token: tag, name: tag, email: `${tag}@example.com` } })).token;
    shortlistToken = (await prisma.shortlist.create({ data: { organizationId: orgA, title: tag, items: { create: { listingId: listingA } } } })).token;
    const login = await fetch(`${API}/api/auth/sign-in/email`, {
      method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${tag}-a@example.com`, password }),
    });
    assert.equal(login.status, 200);
    cookie = login.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
  });

  after(async () => {
    // Only remove fixtures owned by these unique test organizations.
    const ids = [orgA, orgB].filter(Boolean);
    await prisma.calendarEvent.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    const { unlink } = await import("node:fs/promises");
    for (const name of uploadedNames) await unlink(`uploads/${name}`).catch(() => {});
    await prisma.$disconnect();
  });

  test("lead creation, enquiries and updates reject foreign listings and assignees", async () => {
    for (const data of [{ listingId: listingB }, { assignedToId: userB }]) {
      assert.equal((await api("/api/leads", "POST", { name: tag, phone: "+971500009999", ...data })).status, 400);
      assert.equal((await api(`/api/leads/${leadId}`, "PATCH", data)).status, 400);
    }
    assert.equal((await api("/api/leads/enquiries", "POST", { name: tag, phone: "+971500001234", source: "manual", listingId: listingB })).status, 400);
  });

  test("demo mode gates sample writes while fused enquiries can be removed individually", async () => {
    assert.equal((await api("/api/settings/channels")).status, 200);
    const status = await (await api("/api/testing/status")).json();
    const demo = await api("/api/leads/DEMO-ENQUIRIES/", "POST", { source: "manual" });
    if (status.demoMode) {
      assert.equal(demo.status, 201);
      const sample = await demo.json();
      assert.equal(sample.lead.name, "Khalid Al Mansoori");
      assert.equal(sample.lead.phone, "+971501112233");
      const fused = await api("/api/leads/demo-enquiries", "POST", { source: "referral" });
      assert.equal(fused.status, 200);
      const { enquiryId } = await fused.json();
      assert.equal((await api(`/api/leads/${sample.lead.id}/enquiries/${enquiryId}`, "DELETE")).status, 204);
    } else {
      assert.equal(demo.status, 404);
    }

    const original = await prisma.leadSourceEvent.create({ data: {
      leadId, source: "manual", message: "Enquiry via Manual", createdAt: new Date("2025-01-01"),
    } });
    const legacy = await prisma.leadSourceEvent.create({ data: { leadId, source: "referral", message: "Enquiry via Referral" } });
    const response = await api("/api/leads/enquiries", "POST", { name: tag, phone: "+971500001234", source: "referral" });
    assert.equal(response.status, 200);
    const { enquiryId } = await response.json();
    const path = `/api/leads/${leadId}/enquiries`;
    const lead = await (await api(`/api/leads/${leadId}`)).json();
    assert.equal(lead.sources.find((row: { id: string }) => row.id === original.id).removable, false);
    assert.equal(lead.sources.find((row: { id: string }) => row.id === legacy.id).removable, true);
    assert.equal((await api(`${path}/${original.id}`, "DELETE")).status, 409);
    assert.equal((await api(`${path}/${enquiryId}`, "DELETE")).status, 204);
    assert.equal(await prisma.activityEvent.count({ where: { id: enquiryId } }), 0);
    assert.equal(await prisma.leadSourceEvent.count({ where: { leadId, source: "referral" } }), 1);
    assert.equal((await api(`${path}/${legacy.id}`, "DELETE")).status, 204);
    assert.equal(await prisma.leadSourceEvent.count({ where: { leadId, source: "referral" } }), 0);
    assert.equal(await prisma.activityEvent.count({ where: { leadId, type: "enquiry removed" } }), 2);
  });

  test("shortlists reject foreign listings and deduplicate owned IDs", async () => {
    assert.equal((await api("/api/shortlists", "POST", { title: tag, listingIds: [listingB] })).status, 400);
    const response = await api("/api/shortlists", "POST", { title: tag, listingIds: [listingA, listingA] });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).items.length, 1);
  });

  test("viewings preserve won/lost/offer stages and their timestamps", async () => {
    for (const stage of ["WON", "LOST", "OFFER"] as const) {
      const timestamp = new Date("2025-10-01T12:00:00Z");
      await prisma.lead.update({ where: { id: leadId }, data: { stage, wonAt: stage === "WON" ? timestamp : null, lostAt: stage === "LOST" ? timestamp : null } });
      const response = await api("/api/calendar", "POST", { title: tag, type: "VIEWING", startsAt: new Date().toISOString(), leadId });
      assert.equal(response.status, 201);
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      assert.equal(lead.stage, stage);
      assert.equal(lead.wonAt?.toISOString() ?? null, stage === "WON" ? timestamp.toISOString() : null);
      assert.equal(lead.lostAt?.toISOString() ?? null, stage === "LOST" ? timestamp.toISOString() : null);
    }
    await prisma.lead.update({ where: { id: leadId }, data: { stage: "NEW" } });
    assert.equal((await api("/api/calendar", "POST", { title: tag, type: "VIEWING", startsAt: new Date().toISOString(), leadId })).status, 201);
    assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).stage, "VIEWING");
  });

  test("moving only the start time cannot put it after the existing end", async () => {
    const response = await api("/api/calendar", "POST", { title: tag, startsAt: "2026-12-01T10:00:00Z", endsAt: "2026-12-01T11:00:00Z" });
    const event = await response.json();
    assert.equal((await api(`/api/calendar/${event.id}`, "PATCH", { startsAt: "2026-12-01T12:00:00Z" })).status, 400);
  });

  test("editing an old win does not count it as a new win", async () => {
    await prisma.lead.update({ where: { id: leadId }, data: { stage: "WON", wonAt: new Date("2025-01-01T12:00:00Z"), lostAt: null } });
    assert.deepEqual((await computeReportSummary(orgA, resolveDateRange({ range: "7d" }))).winsBySource, []);
    await prisma.lead.update({ where: { id: leadId }, data: { wonAt: new Date() } });
    const report = await computeReportSummary(orgA, resolveDateRange({ range: "7d" }));
    assert.equal(report.winsBySource.reduce((sum, row) => sum + row.count, 0), 1);
    await prisma.lead.update({ where: { id: leadId }, data: { wonAt: null } });
    assert.deepEqual((await computeReportSummary(orgA, resolveDateRange({ range: "7d" }))).winsBySource, [], "a missing win date must not fall back to the last edit date");
  });

  test("brokers cannot write organization settings or channels", async () => {
    assert.equal((await api("/api/settings", "PATCH", { name: "Blocked" })).status, 403);
    assert.equal((await api("/api/settings/channels", "POST", { label: "Blocked", kind: "ADS" })).status, 403);
  });

  test("uploads reject HTML, check ownership and serve images with safe headers", async () => {
    async function upload(id: string, content: Blob, name: string) {
      const form = new FormData(); form.append("photo", content, name);
      return fetch(`${API}/api/listings/${id}/photos`, { method: "POST", headers: { cookie, Origin: "http://localhost:3000" }, body: form });
    }
    const html = new Blob(["<script>alert(document.domain)</script>".repeat(20)], { type: "image/png" });
    assert.equal((await upload(listingA, html, "photo.png")).status, 400);
    assert.equal((await upload(listingB, new Blob([png]), "photo.png")).status, 404);
    const response = await upload(listingA, new Blob([png]), "untrusted.html");
    assert.equal(response.status, 200);
    const url = (await response.json()).coverUrl;
    uploadedNames.push(new URL(url).pathname.split("/").pop()!);
    assert.equal(new URL(url).origin, new URL(API).origin);
    assert.ok(url.endsWith(".png"));
    const image = await fetch(url);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal(image.headers.get("x-content-type-options"), "nosniff");
    assert.ok(image.headers.get("content-security-policy")?.includes("sandbox"));
    assert.equal((await fetch(`${API}/uploads/evil.html`)).status, 404);
  });

  test("suspension blocks existing sessions and every public guide/shortlist path", async () => {
    await prisma.organization.update({ where: { id: orgA }, data: { status: "SUSPENDED" } });
    try {
      assert.equal((await api("/api/leads")).status, 403);
      assert.equal((await api(`/api/leads/${leadId}`, "PATCH", { name: "Blocked" })).status, 403);
      const root = `/api/public/guides/${tag}-a`;
      for (const route of [root, `${root}/${guideSlug}`, `${root}/${guideSlug}/file`, `/api/public/guide-requests/${guideToken}`, `/api/public/guide-files/${guideToken}`, `/api/shortlists/public/${shortlistToken}`]) {
        assert.equal((await fetch(`${API}${route}`)).status, 404, route);
      }
      for (const suffix of ["view", "request"]) {
        assert.equal((await api(`${root}/${guideSlug}/${suffix}`, "POST", { name: tag, email: `${tag}@example.com` })).status, 404);
      }
    } finally {
      await prisma.organization.update({ where: { id: orgA }, data: { status: "ACTIVE" } });
    }
    assert.equal((await api("/api/leads")).status, 200);
  });
});
