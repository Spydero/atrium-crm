import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { buildGuidePdf } from "../src/lib/guidePdf.js";
import { deleteGuideFile } from "../src/lib/guideStorage.js";

const API = process.env.API_URL || "http://localhost:4000";
const run = String(Math.floor(100_000 + Math.random() * 899_999));
const domain = `guidetest-${run}.example`;
const ORG_SLUG = "levante-demo";

let cookie = "";
let orgId = "";
let agentId = "";
let otherOrgId = "";
let otherUserId = "";
let otherGuideId = "";
let originalSettings: { privacyUrl: string | null; licenseNumber: string | null; licenseLabel: string } | null = null;
const guideIds: string[] = [];
let pdfBytes: Buffer;

async function call(path: string, init: RequestInit = {}, auth = true) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
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
  return { status: res.status, json, text, headers: res.headers };
}

const post = (path: string, body: unknown, auth = true) =>
  call(path, { method: "POST", body: JSON.stringify(body) }, auth);

async function upload(path: string, field: string, data: Buffer | string, name: string, type: string) {
  const fd = new FormData();
  fd.append(field, new Blob([data as BlobPart], { type }), name);
  return call(path, { method: "POST", body: fd });
}

async function makeGuide(opts: { title?: string; gated?: boolean; publish?: boolean; file?: boolean } = {}) {
  const r = await post("/api/guides", {
    title: opts.title ?? `UITest Guide ${run} ${guideIds.length}`,
    audience: "BUYER",
    summary: "A test guide summary.",
    benefits: ["One", "Two"],
    gated: opts.gated ?? true,
    ctaText: "Call us.",
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  guideIds.push(r.json.id);
  if (opts.file !== false) {
    const u = await upload(`/api/guides/${r.json.id}/file`, "file", pdfBytes, "test.pdf", "application/pdf");
    assert.equal(u.status, 200, JSON.stringify(u.json));
  }
  if (opts.publish !== false && opts.file !== false) {
    const p = await post(`/api/guides/${r.json.id}/status`, { status: "PUBLISHED" });
    assert.equal(p.status, 200, JSON.stringify(p.json));
  }
  return r.json as { id: string; slug: string };
}

let emailN = 0;
const email = (tag = "p") => `${tag}${++emailN}@${domain}`;

const publicPath = (slug: string, tail = "") => `/api/public/guides/${ORG_SLUG}/${slug}${tail}`;

function request(slug: string, over: Record<string, unknown> = {}) {
  return post(
    publicPath(slug, "/request"),
    { name: "Test Person", email: email(), consentMarketing: false, ...over },
    false,
  );
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
  agentId = me.id;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.slug, ORG_SLUG);
  originalSettings = { privacyUrl: org.privacyUrl, licenseNumber: org.licenseNumber, licenseLabel: org.licenseLabel };

  pdfBytes = await buildGuidePdf({
    org: { name: "Test Realty" },
    title: "Integration Guide",
    subtitle: "Sub",
    audienceLabel: "For tests",
    intro: "Intro.",
    chapters: [{ title: "One", blocks: [{ type: "p", text: "Body text. ".repeat(30) }] }],
    closing: { heading: "Next", text: "Call." },
  });

  const other = await prisma.organization.create({
    data: { name: `Guide Other Org ${run}`, slug: `guide-other-${run}` },
  });
  otherOrgId = other.id;
  otherUserId = (
    await prisma.user.create({
      data: { name: "Guide Outsider", email: `outsider@${domain}`, organizationId: other.id },
    })
  ).id;
  otherGuideId = (
    await prisma.guide.create({
      data: {
        organizationId: other.id,
        slug: "outsider-guide",
        title: "Outsider Guide",
        summary: "x",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    })
  ).id;
});

after(async () => {
  const guides = await prisma.guide.findMany({ where: { id: { in: guideIds } } });
  for (const g of guides) deleteGuideFile(g.filePath);
  const leads = await prisma.lead.findMany({
    where: { organizationId: orgId, OR: [{ email: { endsWith: domain } }, { name: { startsWith: "UITest GuideLead" } }] },
    select: { id: true },
  });
  const leadIds = leads.map((l) => l.id);
  await prisma.calendarEvent.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.guide.deleteMany({ where: { id: { in: [...guideIds, otherGuideId] } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.user.deleteMany({ where: { id: otherUserId } });
  await prisma.organization.deleteMany({ where: { id: otherOrgId } });
  if (originalSettings) {
    await prisma.organization.update({ where: { id: orgId }, data: originalSettings });
  }
  await prisma.$disconnect();
});

test("admin endpoints require sign in, public endpoints do not", async () => {
  for (const [method, path] of [
    ["GET", "/api/guides"],
    ["POST", "/api/guides"],
    ["GET", "/api/guides/x"],
    ["PATCH", "/api/guides/x"],
    ["POST", "/api/guides/x/status"],
    ["POST", "/api/guides/x/file"],
    ["GET", "/api/guides/x/file"],
    ["GET", "/api/guides/x/requests"],
    ["GET", "/api/guides/x/requests.csv"],
    ["DELETE", "/api/guides/x"],
  ] as const) {
    const r = await call(path, { method, body: method === "POST" || method === "PATCH" ? "{}" : undefined }, false);
    assert.equal(r.status, 401, `${method} ${path} should be 401, got ${r.status}`);
  }
  const pub = await call(`/api/public/guides/${ORG_SLUG}`, {}, false);
  assert.equal(pub.status, 200);
});

test("create makes a draft with a unique slug that is not public", async () => {
  const a = await makeGuide({ title: `UITest Slug ${run}`, file: false });
  const b = await makeGuide({ title: `UITest Slug ${run}`, file: false });
  assert.notEqual(a.slug, b.slug);
  assert.ok(b.slug.endsWith("-2"));
  const d = await call(`/api/guides/${a.id}`);
  assert.equal(d.json.status, "DRAFT");
  assert.equal(d.json.hasFile, false);
  assert.equal(d.json.filePath, undefined, "private storage key must never be returned");
  const pub = await call(publicPath(a.slug), {}, false);
  assert.equal(pub.status, 404);
  const list = await call(`/api/public/guides/${ORG_SLUG}`, {}, false);
  assert.ok(!list.json.guides.some((g: any) => g.slug === a.slug));
});

test("validation: short title, bad owner and unknown fields are rejected", async () => {
  assert.equal((await post("/api/guides", { title: "ab" })).status, 400);
  assert.equal((await post("/api/guides", { title: "Valid title", ownerId: "not-a-user" })).status, 400);
  assert.equal((await post("/api/guides", { title: "Valid title", ownerId: otherUserId })).status, 400);
  const g = await makeGuide({ title: `UITest Valid ${run}`, file: false });
  assert.equal((await call(`/api/guides/${g.id}`, { method: "PATCH", body: JSON.stringify({ audience: "ALIENS" }) })).status, 400);
  assert.equal((await call(`/api/guides/${g.id}`, { method: "PATCH", body: JSON.stringify({ ownerId: otherUserId }) })).status, 400);
  const ok = await call(`/api/guides/${g.id}`, {
    method: "PATCH",
    body: JSON.stringify({ subtitle: "Updated", benefits: ["A", "B", "C"], permitNumber: "PRM-1" }),
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.benefits, ["A", "B", "C"]);
  assert.equal(ok.json.permitNumber, "PRM-1");
});

test("publishing needs a real PDF and a summary; bad uploads are refused", async () => {
  const g = await makeGuide({ title: `UITest Upload ${run}`, file: false });
  const early = await post(`/api/guides/${g.id}/status`, { status: "PUBLISHED" });
  assert.equal(early.status, 400);
  assert.match(early.json.error, /upload the pdf/i);

  const notPdf = await upload(`/api/guides/${g.id}/file`, "file", "just some text".padEnd(200, " "), "x.pdf", "application/pdf");
  assert.equal(notPdf.status, 400);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(300)]);
  assert.equal((await upload(`/api/guides/${g.id}/file`, "file", png, "x.pdf", "application/pdf")).status, 400);
  const truncated = pdfBytes.subarray(0, pdfBytes.length - 1100);
  assert.equal((await upload(`/api/guides/${g.id}/file`, "file", truncated, "x.pdf", "application/pdf")).status, 400);
  const missing = await call(`/api/guides/${g.id}/file`, { method: "POST", body: new FormData() });
  assert.equal(missing.status, 400);

  const good = await upload(`/api/guides/${g.id}/file`, "file", pdfBytes, "My Guide.pdf", "application/pdf");
  assert.equal(good.status, 200);
  assert.equal(good.json.hasFile, true);
  assert.equal(good.json.fileName, "My Guide.pdf");
  assert.equal(good.json.filePath, undefined);
  assert.ok(good.json.pageCount >= 2);
  await call(`/api/guides/${g.id}`, { method: "PATCH", body: JSON.stringify({ summary: "" }) });
  const noSummary = await post(`/api/guides/${g.id}/status`, { status: "PUBLISHED" });
  assert.equal(noSummary.status, 400);
  assert.match(noSummary.json.error, /summary/i);
  await call(`/api/guides/${g.id}`, { method: "PATCH", body: JSON.stringify({ summary: "Now with a summary." }) });
  assert.equal((await post(`/api/guides/${g.id}/status`, { status: "PUBLISHED" })).status, 200);

  // Replacing the PDF bumps the version
  const again = await upload(`/api/guides/${g.id}/file`, "file", pdfBytes, "v2.pdf", "application/pdf");
  assert.equal(again.json.version, 2);
});

test("cover upload accepts images only", async () => {
  const g = await makeGuide({ title: `UITest Cover ${run}`, file: false });
  const bad = await upload(`/api/guides/${g.id}/cover`, "cover", "<svg onload=alert(1)></svg>".padEnd(300, " "), "c.svg", "image/svg+xml");
  assert.equal(bad.status, 400);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 1)]);
  const ok = await upload(`/api/guides/${g.id}/cover`, "cover", jpg, "c.jpg", "image/jpeg");
  assert.equal(ok.status, 200);
  assert.match(ok.json.coverUrl, /guide-cover-[0-9a-f]+\.jpg$/);
});

test("the stored PDF is not reachable by guessing a static path", async () => {
  for (const p of ["/storage/guides/x.pdf", "/uploads/../storage/guides/x.pdf", "/guides/x.pdf"]) {
    const r = await call(p, {}, false);
    assert.equal(r.status, 404, p);
  }
});

test("public page data hides internals and includes the consent wording", async () => {
  const g = await makeGuide({ title: `UITest Public ${run}` });
  const r = await call(publicPath(g.slug), {}, false);
  assert.equal(r.status, 200);
  assert.equal(r.json.guide.slug, g.slug);
  assert.equal(r.json.guide.filePath, undefined);
  assert.equal(r.json.guide.ownerId, undefined);
  assert.equal(r.json.guide.organizationId, undefined);
  assert.match(r.json.consentText, /Levante Demo Realty/);
  assert.equal(r.json.organization.slug, ORG_SLUG);
  assert.equal(r.json.organization.id, undefined);
});

test("page views are counted as daily totals", async () => {
  const g = await makeGuide({ title: `UITest Views ${run}` });
  for (let i = 0; i < 3; i++) assert.equal((await post(publicPath(g.slug, "/view"), {}, false)).status, 200);
  const rows = await prisma.guideDailyStat.findMany({ where: { guideId: g.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].views, 3);
  const d = await call(`/api/guides/${g.id}`);
  assert.equal(d.json.stats.views, 3);
  assert.equal((await post(`/api/public/guides/${ORG_SLUG}/no-such-guide/view`, {}, false)).status, 404);
});

test("request form validation", async () => {
  const g = await makeGuide({ title: `UITest Validation ${run}` });
  assert.equal((await request(g.slug, { email: "not-an-email" })).status, 400);
  assert.equal((await request(g.slug, { name: "A" })).status, 400);
  assert.equal((await request(g.slug, { name: "" })).status, 400);
  assert.equal((await request(g.slug, { phone: "123" })).status, 400);
  assert.equal((await request(g.slug, { phone: "abc" })).status, 400);
  const bad = await request(g.slug, { email: "nope" });
  assert.match(bad.json.error, /email/i);
  assert.equal((await post(`/api/public/guides/${ORG_SLUG}/does-not-exist/request`, { name: "Aa", email: email() }, false)).status, 404);
  assert.equal((await post(`/api/public/guides/no-such-org/${g.slug}/request`, { name: "Aa", email: email() }, false)).status, 404);
  const none = await prisma.guideRequest.count({ where: { guideId: g.id } });
  assert.equal(none, 0, "invalid requests store nothing");
});

test("honeypot: bots get a fake success and nothing is stored", async () => {
  const g = await makeGuide({ title: `UITest Honeypot ${run}` });
  const em = email("bot");
  const r = await request(g.slug, { email: em, website: "http://spam.example" });
  assert.equal(r.status, 201);
  assert.equal(await prisma.guideRequest.count({ where: { guideId: g.id } }), 0);
  assert.equal(await prisma.lead.count({ where: { email: em } }), 0);
});

test("a request creates a lead (email only), logs everything and schedules a follow-up", async () => {
  const g = await makeGuide({ title: `UITest Lead ${run}` });
  await prisma.guide.update({ where: { id: g.id }, data: { ownerId: agentId } });
  const em = email("new");
  const r = await request(g.slug, {
    name: "Nina Newlead",
    email: em.toUpperCase(),
    utmSource: "Instagram",
    utmMedium: "social",
    utmCampaign: "spring",
    referrer: "https://www.facebook.com/path?x=1",
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.ok(r.json.token.length >= 32);

  const lead = await prisma.lead.findFirstOrThrow({
    where: { organizationId: orgId, email: em },
    include: { sources: true, activities: true, events: true },
  });
  assert.equal(lead.name, "Nina Newlead");
  assert.equal(lead.phone, null);
  assert.equal(lead.primarySource, "GUIDE");
  assert.equal(lead.stage, "NEW");
  assert.equal(lead.assignedToId, agentId);
  assert.equal(lead.sources.length, 1);
  assert.equal(lead.sources[0].source, "GUIDE");
  assert.match(lead.sources[0].message ?? "", /UITest Lead/);
  assert.ok(lead.activities.some((a) => /guide/i.test(a.body)));
  assert.equal(lead.events.length, 1);
  assert.equal(lead.events[0].type, "FOLLOW_UP");
  assert.ok(lead.events[0].startsAt.getTime() > Date.now());
  assert.ok(![0, 6].includes(lead.events[0].startsAt.getDay()), "follow-up is on a weekday");

  const req = await prisma.guideRequest.findFirstOrThrow({ where: { guideId: g.id } });
  assert.equal(req.leadId, lead.id);
  assert.equal(req.email, em, "email is stored lowercase");
  assert.equal(req.utmSource, "instagram");
  assert.equal(req.referrer, "https://www.facebook.com", "only the origin of the referrer is kept");
  assert.equal(req.consentMarketing, false);
  assert.equal(req.consentText, "");
  assert.equal(req.consentAt, null);
  assert.ok(req.ipHash && !req.ipHash.includes("."), "ip is stored hashed");
  assert.equal(req.downloadCount, 0);
});

test("marketing consent is stored with the exact wording and a timestamp", async () => {
  const g = await makeGuide({ title: `UITest Consent ${run}` });
  const yes = await request(g.slug, { consentMarketing: true, email: email("yes") });
  const no = await request(g.slug, { consentMarketing: false, email: email("no") });
  assert.equal(yes.status, 201);
  const rows = await prisma.guideRequest.findMany({ where: { guideId: g.id }, orderBy: { createdAt: "asc" } });
  const y = rows.find((r) => r.token === yes.json.token)!;
  const n = rows.find((r) => r.token === no.json.token)!;
  assert.equal(y.consentMarketing, true);
  assert.match(y.consentText, /Levante Demo Realty/);
  assert.ok(y.consentAt);
  assert.equal(n.consentMarketing, false);
  assert.equal(n.consentAt, null);
});

test("Lead Fuse: same email (any case) or same phone (any format) joins the existing lead", async () => {
  const g1 = await makeGuide({ title: `UITest Fuse A ${run}` });
  const g2 = await makeGuide({ title: `UITest Fuse B ${run}` });
  const em = email("fuse");
  assert.equal((await request(g1.slug, { name: "Fay Fuse", email: em })).status, 201);
  assert.equal((await request(g2.slug, { name: "Fay F.", email: em.toUpperCase() })).status, 201);
  const leads = await prisma.lead.findMany({ where: { organizationId: orgId, email: em }, include: { sources: true, activities: true } });
  assert.equal(leads.length, 1, "one lead for one person");
  assert.equal(leads[0].name, "Fay Fuse", "existing name is kept");
  assert.equal(leads[0].sources.length, 2);
  assert.ok(leads[0].activities.some((a) => /Lead Fuse/.test(a.body)));
  assert.equal(await prisma.guideRequest.count({ where: { leadId: leads[0].id } }), 2);

  // Phone match across formats: existing lead has a local style number, the guide form uses +country style
  const digits = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
  const created = await post("/api/leads", { name: `UITest GuideLead ${run}`, phone: `050${digits}`, primarySource: "MANUAL" });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const leadId = created.json.lead.id;
  const em2 = email("phonematch");
  const r = await request(g1.slug, { name: "Someone Else", email: em2, phone: `+97150${digits}` });
  assert.equal(r.status, 201);
  const merged = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(merged.email, em2, "blank email is filled from the guide request");
  assert.equal(merged.name, `UITest GuideLead ${run}`);
  assert.equal(await prisma.lead.count({ where: { organizationId: orgId, email: em2 } }), 1);
  assert.equal((await prisma.guideRequest.findFirstOrThrow({ where: { email: em2 } })).leadId, leadId);
});

test("personal token downloads the exact PDF, with safe headers, and counts each download", async () => {
  const g = await makeGuide({ title: `UITest Download ${run}` });
  const r = await request(g.slug, { name: "Dana Download" });
  const token = r.json.token as string;

  const page = await call(`/api/public/guide-requests/${token}`, {}, false);
  assert.equal(page.status, 200);
  assert.equal(page.json.firstName, "Dana");
  assert.equal(page.json.guide.title, g.slug ? `UITest Download ${run}` : "");

  const res = await fetch(`${API}/api/public/guide-files/${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(res.headers.get("content-disposition") ?? "", /^attachment; filename="[A-Za-z0-9-]+\.pdf"$/);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  const body = Buffer.from(await res.arrayBuffer());
  assert.ok(body.equals(pdfBytes), "served bytes equal the uploaded file");

  await (await fetch(`${API}/api/public/guide-files/${token}`)).arrayBuffer();
  const row = await prisma.guideRequest.findUniqueOrThrow({ where: { token } });
  assert.equal(row.downloadCount, 2);
  assert.ok(row.firstDownloadedAt && row.lastDownloadedAt);
  assert.ok(row.lastDownloadedAt!.getTime() >= row.firstDownloadedAt!.getTime());

  assert.equal((await call("/api/public/guide-files/not-a-real-token", {}, false)).status, 404);
  assert.equal((await call(`/api/public/guide-files/${token}x`, {}, false)).status, 404);
  assert.equal((await call("/api/public/guide-files/..%2F..%2Fetc%2Fpasswd", {}, false)).status, 404);
});

test("archiving withdraws the guide: page 404, personal links 410", async () => {
  const g = await makeGuide({ title: `UITest Archive ${run}` });
  const token = (await request(g.slug)).json.token as string;
  assert.equal((await post(`/api/guides/${g.id}/status`, { status: "ARCHIVED" })).status, 200);
  assert.equal((await call(publicPath(g.slug), {}, false)).status, 404);
  assert.equal((await call(`/api/public/guide-files/${token}`, {}, false)).status, 410);
  assert.equal((await call(`/api/public/guide-requests/${token}`, {}, false)).status, 404);
  assert.equal((await request(g.slug)).status, 404, "no new requests for an archived guide");
  // restore: link works again
  assert.equal((await post(`/api/guides/${g.id}/status`, { status: "PUBLISHED" })).status, 200);
  assert.equal((await call(`/api/public/guide-files/${token}`, {}, false)).status, 200);
});

test("open guides download without a form and are counted; gated guides refuse", async () => {
  const open = await makeGuide({ title: `UITest Open ${run}`, gated: false });
  const gated = await makeGuide({ title: `UITest Gated ${run}`, gated: true });
  const res = await fetch(`${API}${publicPath(open.slug, "/file")}`);
  assert.equal(res.status, 200);
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(pdfBytes));
  await (await fetch(`${API}${publicPath(open.slug, "/file")}`)).arrayBuffer();
  const stat = await prisma.guideDailyStat.findFirstOrThrow({ where: { guideId: open.id } });
  assert.equal(stat.downloads, 2);
  assert.equal(await prisma.lead.count({ where: { guideRequests: { some: { guideId: open.id } } } }), 0, "no lead without a form");
  const d = await call(`/api/guides/${open.id}`);
  assert.equal(d.json.stats.openDownloads, 2);
  assert.equal(d.json.stats.totalDownloads, 2);
  assert.equal((await call(publicPath(gated.slug, "/file"), {}, false)).status, 403);
});

test("rate limits: repeated emails and floods from one address are stopped", async () => {
  const g = await makeGuide({ title: `UITest RateEmail ${run}` });
  const same = email("same");
  const codes: number[] = [];
  for (let i = 0; i < 6; i++) codes.push((await request(g.slug, { email: same })).status);
  assert.deepEqual(codes.slice(0, 4), [201, 201, 201, 201]);
  assert.equal(codes[4], 429);
  assert.equal(codes[5], 429);

  const flood = await makeGuide({ title: `UITest RateIp ${run}` });
  const out: number[] = [];
  for (let i = 0; i < 12; i++) out.push((await request(flood.slug)).status);
  assert.equal(out.filter((c) => c === 201).length, 10);
  assert.equal(out[10], 429);
  assert.match((await request(flood.slug)).json.error, /too many/i);
});

test("tenant isolation: another organization's guides are invisible and untouchable", async () => {
  const list = await call("/api/guides");
  assert.ok(!list.json.guides.some((g: any) => g.id === otherGuideId));
  for (const [method, path, body] of [
    ["GET", `/api/guides/${otherGuideId}`],
    ["PATCH", `/api/guides/${otherGuideId}`, { title: "Hacked title" }],
    ["POST", `/api/guides/${otherGuideId}/status`, { status: "ARCHIVED" }],
    ["GET", `/api/guides/${otherGuideId}/requests`],
    ["GET", `/api/guides/${otherGuideId}/requests.csv`],
    ["GET", `/api/guides/${otherGuideId}/file`],
    ["DELETE", `/api/guides/${otherGuideId}`],
  ] as const) {
    const r = await call(path, { method, body: body ? JSON.stringify(body) : undefined });
    assert.equal(r.status, 404, `${method} ${path} should be 404, got ${r.status}`);
  }
  const untouched = await prisma.guide.findUniqueOrThrow({ where: { id: otherGuideId } });
  assert.equal(untouched.title, "Outsider Guide");
  assert.equal(untouched.status, "PUBLISHED");

  // A guide slug only resolves under its own organization
  const mine = await makeGuide({ title: `UITest Tenant ${run}` });
  assert.equal((await call(`/api/public/guides/guide-other-${run}/${mine.slug}`, {}, false)).status, 404);
  assert.equal((await call(`/api/public/guides/${ORG_SLUG}/outsider-guide`, {}, false)).status, 404);
});

test("request log and CSV export (BOM, consent, formula injection safe)", async () => {
  const g = await makeGuide({ title: `UITest Csv ${run}` });
  await request(g.slug, { name: "=HYPERLINK(\"http://evil\")", email: email("csv"), consentMarketing: true, utmSource: "newsletter", utmMedium: "email" });
  await request(g.slug, { name: "Plain Person", email: email("csv2") });
  const log = await call(`/api/guides/${g.id}/requests`);
  assert.equal(log.status, 200);
  assert.equal(log.json.length, 2);
  assert.ok(log.json[0].lead);
  const csv = await call(`/api/guides/${g.id}/requests.csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(csv.headers.get("content-disposition") ?? "", /attachment; filename="guide-.*\.csv"/);
  const raw = Buffer.from(await (await fetch(`${API}/api/guides/${g.id}/requests.csv`, { headers: { cookie } })).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM for Excel");
  assert.ok(csv.text.includes("Marketing consent"));
  assert.ok(csv.text.includes("'=HYPERLINK"), "formula is neutralised");
  assert.ok(!/(^|,)=HYPERLINK/m.test(csv.text));
  assert.ok(csv.text.includes("newsletter"));
  assert.ok(!/[\u2014\u2013]/.test(csv.text), "no long dashes");
});

test("merging leads keeps guide requests attached to the surviving lead", async () => {
  const g = await makeGuide({ title: `UITest Merge ${run}` });
  const em = email("mergeme");
  const token = (await request(g.slug, { name: "Mia Merge", email: em })).json.token as string;
  const guideLead = await prisma.lead.findFirstOrThrow({ where: { organizationId: orgId, email: em } });
  const digits = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
  const manual = await post("/api/leads", { name: `UITest GuideLead ${run} keep`, phone: `+97155${digits}`, primarySource: "MANUAL" });
  const keepId = manual.json.lead.id as string;
  const m = await post("/api/leads/merge", { primaryId: keepId, duplicateIds: [guideLead.id] });
  assert.equal(m.status, 200, JSON.stringify(m.json));
  const req = await prisma.guideRequest.findUniqueOrThrow({ where: { token } });
  assert.equal(req.leadId, keepId, "request follows the merge");
  const kept = await prisma.lead.findUniqueOrThrow({ where: { id: keepId } });
  assert.equal(kept.email, em, "email from the guide lead is kept on the survivor");
  assert.equal(await prisma.lead.count({ where: { id: guideLead.id } }), 0);
});

test("leads without a phone work in lists and duplicate detection", async () => {
  const g = await makeGuide({ title: `UITest Nophone ${run}` });
  const em = email("nophone");
  await request(g.slug, { name: "No Phone", email: em });
  const list = await call("/api/leads");
  assert.equal(list.status, 200);
  const found = list.json.find((l: any) => l.email === em || l.name === "No Phone");
  assert.ok(found);
  assert.equal(found.phone, null);
  const dups = await call("/api/leads/duplicates");
  assert.equal(dups.status, 200);
  const csv = await call("/api/leads/export.csv");
  assert.equal(csv.status, 200);
});

test("delete rules: published and requested guides are protected", async () => {
  const pub = await makeGuide({ title: `UITest DelPub ${run}` });
  assert.equal((await call(`/api/guides/${pub.id}`, { method: "DELETE" })).status, 400);
  await request(pub.slug);
  await post(`/api/guides/${pub.id}/status`, { status: "ARCHIVED" });
  const withReq = await call(`/api/guides/${pub.id}`, { method: "DELETE" });
  assert.equal(withReq.status, 400);
  assert.match(withReq.json.error, /archive|request/i);

  const draft = await makeGuide({ title: `UITest DelDraft ${run}`, file: false });
  assert.equal((await call(`/api/guides/${draft.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await call(`/api/guides/${draft.id}`)).status, 404);
});

test("reports include guide figures in summary, CSV and PDF", async () => {
  const g = await makeGuide({ title: `UITest Reports ${run}` });
  await post(publicPath(g.slug, "/view"), {}, false);
  const t = (await request(g.slug)).json.token;
  await fetch(`${API}/api/public/guide-files/${t}`).then((r) => r.arrayBuffer());

  const s = await call("/api/reports/summary?range=7d");
  assert.equal(s.status, 200);
  const row = s.json.guides.guides.find((x: any) => x.title === `UITest Reports ${run}`);
  assert.ok(row);
  assert.equal(row.views, 1);
  assert.equal(row.requests, 1);
  assert.equal(row.totalDownloads, 1);
  assert.equal(row.requestRate, 1);
  assert.equal(row.downloadRate, 1);
  assert.ok(s.json.guides.totals.requests >= 1);
  assert.ok(s.json.guides.guideLeadShare.guideLeads >= 1);
  assert.ok(s.json.leadsBySource.some((x: any) => x.source === "GUIDE"));

  const csv = await call("/api/reports/export.csv?range=7d");
  assert.ok(csv.text.includes(`Guide: UITest Reports ${run}`));
  assert.ok(csv.text.includes("Guide requests by channel"));

  const pdf = await fetch(`${API}/api/reports/export.pdf?range=7d`, { headers: { cookie } });
  assert.equal(pdf.status, 200);
  const buf = Buffer.from(await pdf.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(buf.length > 4000);
});

test("settings: privacy link must be a real URL, licence details are saved", async () => {
  const bad = await call("/api/settings", { method: "PATCH", body: JSON.stringify({ privacyUrl: "javascript:alert(1)" }) });
  assert.equal(bad.status, 400);
  const bad2 = await call("/api/settings", { method: "PATCH", body: JSON.stringify({ privacyUrl: "ftp://x.test" }) });
  assert.equal(bad2.status, 400);
  const ok = await call("/api/settings", {
    method: "PATCH",
    body: JSON.stringify({ privacyUrl: "https://example.com/privacy", licenseLabel: "Reg no.", licenseNumber: "TEST-1" }),
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.privacyUrl, "https://example.com/privacy");
  const pub = await call(`/api/public/guides/${ORG_SLUG}`, {}, false);
  assert.equal(pub.json.organization.privacyUrl, "https://example.com/privacy");
  assert.equal(pub.json.organization.licenseNumber, "TEST-1");
  const clear = await call("/api/settings", { method: "PATCH", body: JSON.stringify({ privacyUrl: "", licenseNumber: "" }) });
  assert.equal(clear.json.privacyUrl, null);
  assert.equal(clear.json.licenseNumber, null);
});
