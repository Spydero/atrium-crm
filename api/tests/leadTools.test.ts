import test from "node:test";
import assert from "node:assert/strict";
import {
  emailKey,
  groupDuplicates,
  mergeLeadFields,
  mergedFromNote,
  phoneKey,
  suggestPrimary,
  type DupCandidate,
  type Mergeable,
} from "../src/lib/leadTools.js";

function cand(over: Partial<DupCandidate> & { id: string }): DupCandidate {
  return {
    phone: "+971500000000",
    email: null,
    stage: "NEW",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    sourcesCount: 1,
    notesCount: 0,
    ...over,
  };
}

function mergeable(over: Partial<Mergeable> = {}): Mergeable {
  return {
    name: "A",
    phone: "+971501112233",
    email: null,
    listingId: null,
    assignedToId: null,
    budgetMin: null,
    budgetMax: null,
    bedsWanted: null,
    dealValueAed: null,
    communities: [],
    notesSummary: null,
    createdAt: new Date("2026-10-10T00:00:00Z"),
    firstRespondedAt: null,
    ...over,
  };
}

test("phoneKey matches international and local formats", () => {
  assert.equal(phoneKey("+971501112233"), "501112233");
  assert.equal(phoneKey("0501112233"), "501112233");
  assert.equal(phoneKey("+971 50 111 2233"), "501112233");
  assert.equal(phoneKey("00971-50-111-2233"), "501112233");
});

test("phoneKey ignores numbers that are too short", () => {
  assert.equal(phoneKey("12345"), null);
  assert.equal(phoneKey(""), null);
  assert.equal(phoneKey(null), null);
});

test("emailKey is case and whitespace insensitive", () => {
  assert.equal(emailKey("  Khalid@Example.COM "), "khalid@example.com");
  assert.equal(emailKey("not-an-email"), null);
  assert.equal(emailKey(null), null);
});

test("groupDuplicates finds same phone in different formats", () => {
  const groups = groupDuplicates([
    cand({ id: "a", phone: "+971501112233" }),
    cand({ id: "b", phone: "0501112233" }),
    cand({ id: "c", phone: "+971559998877" }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].leads.map((l) => l.id).sort(), ["a", "b"]);
  assert.deepEqual(groups[0].reasons, ["phone"]);
});

test("groupDuplicates finds same email with different phones", () => {
  const groups = groupDuplicates([
    cand({ id: "a", phone: "+971501112233", email: "x@y.com" }),
    cand({ id: "b", phone: "+971559998877", email: "X@Y.com" }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].reasons, ["email"]);
});

test("groupDuplicates links transitively across phone and email", () => {
  const groups = groupDuplicates([
    cand({ id: "a", phone: "+971501112233", email: "x@y.com" }),
    cand({ id: "b", phone: "0501112233", email: null }),
    cand({ id: "c", phone: "+971559998877", email: "x@y.com" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].leads.length, 3);
  assert.deepEqual(groups[0].reasons.sort(), ["email", "phone"]);
});

test("groupDuplicates returns nothing when leads are distinct", () => {
  const groups = groupDuplicates([
    cand({ id: "a", phone: "+971501112233", email: "a@a.com" }),
    cand({ id: "b", phone: "+971559998877", email: "b@b.com" }),
  ]);
  assert.equal(groups.length, 0);
});

test("groupDuplicates does not match on very short numbers", () => {
  const groups = groupDuplicates([
    cand({ id: "a", phone: "1234" }),
    cand({ id: "b", phone: "1234" }),
  ]);
  assert.equal(groups.length, 0);
});

test("groupDuplicates puts the largest group first", () => {
  const groups = groupDuplicates([
    cand({ id: "a1", phone: "+971501110000" }),
    cand({ id: "a2", phone: "0501110000" }),
    cand({ id: "b1", phone: "+971502220000" }),
    cand({ id: "b2", phone: "0502220000" }),
    cand({ id: "b3", phone: "+971 50 222 0000" }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].leads.length, 3);
});

test("suggestPrimary prefers the furthest stage", () => {
  const p = suggestPrimary([
    cand({ id: "new", stage: "NEW", sourcesCount: 5 }),
    cand({ id: "offer", stage: "OFFER" }),
    cand({ id: "lost", stage: "LOST", sourcesCount: 9 }),
  ]);
  assert.equal(p.id, "offer");
});

test("suggestPrimary breaks ties by history then age", () => {
  const byHistory = suggestPrimary([
    cand({ id: "thin", sourcesCount: 1 }),
    cand({ id: "rich", sourcesCount: 2, notesCount: 2 }),
  ]);
  assert.equal(byHistory.id, "rich");
  const byAge = suggestPrimary([
    cand({ id: "newer", createdAt: new Date("2026-10-05T00:00:00Z") }),
    cand({ id: "older", createdAt: new Date("2026-10-01T00:00:00Z") }),
  ]);
  assert.equal(byAge.id, "older");
});

test("mergeLeadFields keeps primary values and fills blanks from duplicates", () => {
  const primary = mergeable({ email: "keep@x.com", budgetMax: 2_000_000 });
  const dup1 = mergeable({ email: "other@x.com", budgetMax: 9_000_000, bedsWanted: 2, listingId: "L1" });
  const dup2 = mergeable({ bedsWanted: 4, listingId: "L2", assignedToId: "U2", dealValueAed: 1_500_000 });
  const r = mergeLeadFields(primary, [dup1, dup2]);
  assert.equal(r.email, "keep@x.com");
  assert.equal(r.budgetMax, 2_000_000);
  assert.equal(r.bedsWanted, 2);
  assert.equal(r.listingId, "L1");
  assert.equal(r.assignedToId, "U2");
  assert.equal(r.dealValueAed, 1_500_000);
});

test("mergeLeadFields treats empty strings as blank", () => {
  const r = mergeLeadFields(
    mergeable({ email: "", notesSummary: "" }),
    [mergeable({ email: "fill@x.com", notesSummary: "Wants sea view" })],
  );
  assert.equal(r.email, "fill@x.com");
  assert.equal(r.notesSummary, "Wants sea view");
});

test("mergeLeadFields unions communities without duplicates", () => {
  const r = mergeLeadFields(
    mergeable({ communities: ["Dubai Marina", "JBR"] }),
    [mergeable({ communities: ["JBR", "Downtown Dubai"] })],
  );
  assert.deepEqual(r.communities, ["Dubai Marina", "JBR", "Downtown Dubai"]);
});

test("mergeLeadFields keeps the earliest createdAt and firstRespondedAt", () => {
  const r = mergeLeadFields(
    mergeable({ createdAt: new Date("2026-10-10T00:00:00Z"), firstRespondedAt: new Date("2026-10-12T00:00:00Z") }),
    [
      mergeable({ createdAt: new Date("2026-10-02T00:00:00Z"), firstRespondedAt: new Date("2026-10-03T00:00:00Z") }),
      mergeable({ createdAt: new Date("2026-10-20T00:00:00Z"), firstRespondedAt: null }),
    ],
  );
  assert.equal(r.createdAt.toISOString(), "2026-10-02T00:00:00.000Z");
  assert.equal(r.firstRespondedAt?.toISOString(), "2026-10-03T00:00:00.000Z");
});

test("mergeLeadFields leaves null when nobody has a value", () => {
  const r = mergeLeadFields(mergeable(), [mergeable()]);
  assert.equal(r.email, null);
  assert.equal(r.firstRespondedAt, null);
  assert.deepEqual(r.communities, []);
});

test("mergedFromNote records contact details that differ", () => {
  const note = mergedFromNote(
    { phone: "+971501112233", email: "a@x.com" },
    { name: "K. Mansoori", phone: "0501112233", email: "b@x.com" },
  );
  assert.match(note, /K\. Mansoori/);
  assert.match(note, /0501112233/);
  assert.match(note, /b@x\.com/);
});

test("mergedFromNote omits details that match", () => {
  const note = mergedFromNote(
    { phone: "+971501112233", email: "a@x.com" },
    { name: "Dup", phone: "+971501112233", email: "A@x.com" },
  );
  assert.doesNotMatch(note, /Other contact details/);
});

test("no long dashes in merge notes", () => {
  const note = mergedFromNote(
    { phone: "1", email: null },
    { name: "Dup", phone: "2", email: "x@y.com" },
  );
  assert.doesNotMatch(note, /[\u2013\u2014]/);
});
