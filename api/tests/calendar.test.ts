import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "../src/lib/prisma.js";

const API = process.env.API_URL || "http://localhost:4000";

let cookie = "";
let orgId = "";

async function login() {
  const res = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ email: "agent@atrium.demo", password: "demo1234" }),
  });
  assert.equal(res.status, 200);
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

function api(path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Origin: "http://localhost:3000",
      cookie,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
}

describe("calendar depth", () => {
  before(async () => {
    await login();
    orgId = (await prisma.organization.findFirstOrThrow({ where: { slug: "levante-demo" } })).id;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  test("POST creates SCHEDULED with notes and createdBy", async () => {
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + 2);
    startsAt.setHours(11, 0, 0, 0);
    const res = await api("/api/calendar", {
      method: "POST",
      body: JSON.stringify({
        title: "Calendar depth probe viewing",
        type: "VIEWING",
        startsAt: startsAt.toISOString(),
        notes: "Bring floor plans",
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.outcome, "SCHEDULED");
    assert.equal(body.notes, "Bring floor plans");
    assert.ok(body.createdBy?.name);
    await api(`/api/calendar/${body.id}`, { method: "DELETE" });
  });

  test("CANCELLED needs a reason; reopen clears it", async () => {
    const startsAt = new Date();
    startsAt.setHours(startsAt.getHours() + 5);
    const created = await (
      await api("/api/calendar", {
        method: "POST",
        body: JSON.stringify({
          title: "Cancel probe",
          type: "FOLLOW_UP",
          startsAt: startsAt.toISOString(),
        }),
      })
    ).json();

    const bad = await api(`/api/calendar/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ outcome: "CANCELLED" }),
    });
    assert.equal(bad.status, 400);

    const ok = await api(`/api/calendar/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        outcome: "CANCELLED",
        cancelReason: "CLIENT",
        feedback: "Client paused the search",
      }),
    });
    assert.equal(ok.status, 200);
    const cancelled = await ok.json();
    assert.equal(cancelled.outcome, "CANCELLED");
    assert.equal(cancelled.cancelReason, "CLIENT");
    assert.ok(cancelled.outcomeAt);

    const reopen = await api(`/api/calendar/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ outcome: "SCHEDULED" }),
    });
    assert.equal(reopen.status, 200);
    const open = await reopen.json();
    assert.equal(open.outcome, "SCHEDULED");
    assert.equal(open.cancelReason, null);
    assert.equal(open.outcomeAt, null);

    await api(`/api/calendar/${created.id}`, { method: "DELETE" });
  });

  test("NO_SHOW rejected on tasks; allowed on calls", async () => {
    const startsAt = new Date();
    startsAt.setHours(startsAt.getHours() + 3);
    const task = await (
      await api("/api/calendar", {
        method: "POST",
        body: JSON.stringify({ title: "Task probe", type: "TASK", startsAt: startsAt.toISOString() }),
      })
    ).json();
    assert.equal(
      (
        await api(`/api/calendar/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ outcome: "NO_SHOW" }),
        })
      ).status,
      400,
    );
    await api(`/api/calendar/${task.id}`, { method: "DELETE" });

    const call = await (
      await api("/api/calendar", {
        method: "POST",
        body: JSON.stringify({ title: "Call probe", type: "CALL", startsAt: startsAt.toISOString() }),
      })
    ).json();
    const ok = await api(`/api/calendar/${call.id}`, {
      method: "PATCH",
      body: JSON.stringify({ outcome: "NO_SHOW", feedback: "Ringing out" }),
    });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).outcome, "NO_SHOW");
    await api(`/api/calendar/${call.id}`, { method: "DELETE" });
  });

  test("DELETE removes the row and needs auth", async () => {
    const startsAt = new Date();
    startsAt.setHours(startsAt.getHours() + 4);
    const created = await (
      await api("/api/calendar", {
        method: "POST",
        body: JSON.stringify({ title: "Delete me", type: "TASK", startsAt: startsAt.toISOString() }),
      })
    ).json();
    assert.equal((await fetch(`${API}/api/calendar/${created.id}`, { method: "DELETE" })).status, 401);
    assert.equal((await api(`/api/calendar/${created.id}`, { method: "DELETE" })).status, 204);
    assert.equal(await prisma.calendarEvent.count({ where: { id: created.id } }), 0);
  });

  test("PATCH edits notes and time", async () => {
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + 1);
    startsAt.setHours(10, 0, 0, 0);
    const created = await (
      await api("/api/calendar", {
        method: "POST",
        body: JSON.stringify({ title: "Edit probe", type: "CALL", startsAt: startsAt.toISOString() }),
      })
    ).json();
    const next = new Date(startsAt);
    next.setHours(15, 30, 0, 0);
    const res = await api(`/api/calendar/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: "Edited call",
        notes: "Discuss offer structure",
        startsAt: next.toISOString(),
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.title, "Edited call");
    assert.equal(body.notes, "Discuss offer structure");
    assert.equal(new Date(body.startsAt).getHours(), 15);
    await api(`/api/calendar/${created.id}`, { method: "DELETE" });
  });

  test("every event has a required outcome after migration", async () => {
    const rows = await prisma.calendarEvent.findMany({
      where: { organizationId: orgId },
      select: { outcome: true },
      take: 100,
    });
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => ["SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED"].includes(r.outcome)));
  });
});
