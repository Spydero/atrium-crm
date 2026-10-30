import test from "node:test";
import assert from "node:assert/strict";
import {
  channelLabel,
  checkImage,
  checkPdf,
  cleanUtm,
  consentWording,
  hashIp,
  makeToken,
  MAX_PDF_BYTES,
  nextBusinessDay,
  pdfPageCount,
  RateLimiter,
  slugify,
  uniqueSlug,
  utmLink,
} from "../src/lib/guideTools.js";
import { buildGuidePdf } from "../src/lib/guidePdf.js";
import { mergeLeadFields, type Mergeable } from "../src/lib/leadTools.js";

async function samplePdf(chapters = 2) {
  return buildGuidePdf({
    org: { name: "Test Realty" },
    title: "Test Guide",
    subtitle: "Sub",
    audienceLabel: "For testing",
    intro: "Intro text.",
    chapters: Array.from({ length: chapters }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      blocks: [{ type: "p" as const, text: "Some paragraph. ".repeat(40) }],
    })),
    closing: { heading: "Next", text: "Talk to us." },
  });
}

test("slugify handles apostrophes, ampersands, accents and symbols", () => {
  assert.equal(slugify("The First-Time Buyer's Guide"), "the-first-time-buyers-guide");
  assert.equal(slugify("Buy & Sell: A Guide!"), "buy-and-sell-a-guide");
  assert.equal(slugify("Café Résumé"), "cafe-resume");
  assert.equal(slugify("   "), "guide");
  assert.equal(slugify("***"), "guide");
  assert.ok(slugify("x".repeat(200)).length <= 60);
  assert.ok(!slugify("A very long title ".repeat(10)).endsWith("-"));
});

test("uniqueSlug appends the next free number", () => {
  assert.equal(uniqueSlug("guide", []), "guide");
  assert.equal(uniqueSlug("guide", ["guide"]), "guide-2");
  assert.equal(uniqueSlug("guide", ["guide", "guide-2", "guide-3"]), "guide-4");
});

test("makeToken is long, URL safe and unique", () => {
  const tokens = new Set(Array.from({ length: 500 }, () => makeToken()));
  assert.equal(tokens.size, 500);
  for (const t of tokens) {
    assert.ok(t.length >= 32);
    assert.match(t, /^[A-Za-z0-9_-]+$/);
  }
});

test("hashIp is stable, salted, and does not contain the address", () => {
  const a = hashIp("203.0.113.9", "secret");
  assert.equal(a, hashIp("203.0.113.9", "secret"));
  assert.notEqual(a, hashIp("203.0.113.9", "other"));
  assert.notEqual(a, hashIp("203.0.113.10", "secret"));
  assert.ok(!a!.includes("203"));
  assert.equal(hashIp(undefined, "s"), null);
});

test("checkPdf accepts a real PDF and reports page count", async () => {
  const pdf = await samplePdf(3);
  const r = checkPdf(pdf);
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.pageCount && r.pageCount >= 3, `pageCount ${r.pageCount}`);
});

test("checkPdf rejects non PDFs, damaged and oversize files", async () => {
  assert.equal(checkPdf(Buffer.from("hello")).ok, false);
  assert.equal(checkPdf(Buffer.alloc(500, 65)).ok, false);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(500)]);
  const r = checkPdf(png);
  assert.equal(r.ok, false);
  const pdf = await samplePdf();
  const noEof = pdf.subarray(0, pdf.length - 1100);
  assert.equal(checkPdf(noEof).ok, false);
  const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(MAX_PDF_BYTES + 10), Buffer.from("%%EOF")]);
  const big2 = checkPdf(big);
  assert.equal(big2.ok, false);
  if (!big2.ok) assert.match(big2.error, /too large/i);
});

test("pdfPageCount matches the document", async () => {
  const one = await samplePdf(1);
  const five = await samplePdf(5);
  assert.ok((pdfPageCount(five) ?? 0) > (pdfPageCount(one) ?? 0));
});

test("checkImage recognises jpeg, png, webp and rejects the rest", () => {
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(200)]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200)]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(200)]);
  assert.deepEqual(checkImage(jpg), { ok: true, ext: "jpg" });
  assert.deepEqual(checkImage(png), { ok: true, ext: "png" });
  assert.deepEqual(checkImage(webp), { ok: true, ext: "webp" });
  assert.equal(checkImage(Buffer.from("<svg onload=alert(1)>".padEnd(300, " "))).ok, false);
  assert.equal(checkImage(Buffer.alloc(50)).ok, false);
  assert.equal(checkImage(Buffer.alloc(6 * 1024 * 1024, 0xff)).ok, false);
});

test("consentWording names the organization", () => {
  assert.match(consentWording("Levante Realty"), /Levante Realty/);
});

test("nextBusinessDay skips weekends and is always in the future at 10:00", () => {
  const fri = nextBusinessDay(new Date(2026, 9, 30, 15, 0)); // Fri 30 Oct 2026
  assert.equal(fri.getDay(), 1);
  assert.equal(fri.getDate(), 2);
  assert.equal(fri.getHours(), 10);
  const sat = nextBusinessDay(new Date(2026, 9, 31, 1, 0));
  assert.equal(sat.getDay(), 1);
  const mon = nextBusinessDay(new Date(2026, 10, 2, 9, 0));
  assert.equal(mon.getDay(), 2);
  assert.ok(mon.getTime() > new Date(2026, 10, 2, 9, 0).getTime());
});

test("cleanUtm trims, lowercases, limits and keeps only an origin for referrers", () => {
  const u = cleanUtm({
    utmSource: "  Instagram ",
    utmMedium: "Social!!",
    utmCampaign: "x".repeat(300),
    referrer: "https://www.facebook.com/some/path?token=secret",
  });
  assert.equal(u.utmSource, "instagram");
  assert.equal(u.utmMedium, "social");
  assert.equal(u.utmCampaign!.length, 80);
  assert.equal(u.referrer, "https://www.facebook.com");
  assert.equal(cleanUtm({ referrer: "javascript:alert(1)" }).referrer, null);
  assert.deepEqual(cleanUtm(null), { utmSource: null, utmMedium: null, utmCampaign: null, referrer: null });
  assert.equal(cleanUtm({ utmSource: 42 }).utmSource, null);
});

test("RateLimiter allows up to max inside the window then blocks, per key", () => {
  const rl = new RateLimiter(3, 1000);
  assert.ok(rl.allow("a", 0));
  assert.ok(rl.allow("a", 100));
  assert.ok(rl.allow("a", 200));
  assert.equal(rl.allow("a", 300), false);
  assert.ok(rl.allow("b", 300), "other keys are independent");
  assert.ok(rl.allow("a", 1201), "window slides");
});

test("utmLink adds only the parameters given", () => {
  assert.equal(utmLink("https://x.test/guides/a/b", {}), "https://x.test/guides/a/b");
  assert.equal(
    utmLink("https://x.test/g", { source: "ig", medium: "social" }),
    "https://x.test/g?utm_source=ig&utm_medium=social",
  );
});

test("mergeLeadFields fills a missing phone from a duplicate (email-only guide leads)", () => {
  const base: Mergeable = {
    name: "A",
    phone: null,
    email: "a@x.com",
    listingId: null,
    assignedToId: null,
    budgetMin: null,
    budgetMax: null,
    bedsWanted: null,
    dealValueAed: null,
    communities: [],
    notesSummary: null,
    createdAt: new Date("2026-10-02T00:00:00Z"),
    firstRespondedAt: null,
  };
  const r = mergeLeadFields(base, [{ ...base, phone: "+971501112233" }]);
  assert.equal(r.phone, "+971501112233");
  assert.equal(mergeLeadFields({ ...base, phone: "+1" }, [{ ...base, phone: "+2" }]).phone, "+1");
});

test("channelLabel gives friendly names for tags and referrers", () => {
  assert.equal(channelLabel("instagram", "social"), "Instagram (social)");
  assert.equal(channelLabel("google", "cpc"), "Google (paid ads)");
  assert.equal(channelLabel("open-house", "qr"), "Open house (QR code)");
  assert.equal(channelLabel("whatsapp", "share"), "WhatsApp (shared link)");
  assert.equal(channelLabel("newsletter", null), "Newsletter");
  assert.equal(channelLabel(null, null, "https://www.facebook.com"), "facebook.com (referral)");
  assert.equal(channelLabel(null, null, "not a url"), "Direct");
  assert.equal(channelLabel(null, null, null), "Direct");
  assert.equal(channelLabel("custom-thing", "weird_medium"), "Custom thing (weird medium)");
});
