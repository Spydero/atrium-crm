import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium } from "../../web/node_modules/playwright/index.mjs";
import { prisma } from "../src/lib/prisma.ts";
import { createUserWithPassword } from "../src/lib/createUserAccount.ts";
import { buildGuidePdf } from "../src/lib/guidePdf.ts";

const url = process.env.CLIENT_ORIGIN || "http://localhost:3000";
const api = process.env.API_URL || "http://localhost:4000";
assert.ok([url, api].every(value => ["localhost", "127.0.0.1"].includes(new URL(value).hostname)), "Use local development servers.");
const tag = randomUUID();
const password = "Messaging-regression-123!";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAA00lEQVR4nAHIADf/AAAHDhMaISYtNDlAR0xTWl9mbXJ5gIWMkwAXHiUqMTg9REtQV15janF2fYSJkJeco6oALjU8QUhPVFtiZ251eoGIjZSboKeus7rBAEVMU1hfZmtyeX6FjJGYn6Srsre+xcrR2ABcY2pvdn2CiZCVnKOor7a7wsnO1dzh6O8Ac3qBho2UmaCnrLO6v8bN0tng5ezz+P8GAIqRmJ2kq7C3vsPK0dbd5Onw9/wDCg8WHQChqK+0u8LHztXa4ejt9PsABw4TGiEmLTR4xmSBIxtb6gAAAABJRU5ErkJggg==", "base64");
const orgIds = [];
const browser = await chromium.launch({ headless: true });
const errors = [];

const dayMs = 24 * 3600_000;
function assertExpiry(expiresAt, days) {
  if (days === null) assert.equal(expiresAt, null);
  else assert.ok(Math.abs(new Date(expiresAt).getTime() - Date.now() - days * dayMs) < 60_000,
    `Expected a ${days}-day expiration`);
}

async function createLink({ page, context }, buttonName, days = 7, requirePin = false) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url });
  const expiry = page.getByLabel("Link expiry");
  if (days === null) await expiry.selectOption("never");
  else if (days === 1 || days === 7 || days === 30) await expiry.selectOption(String(days));
  else {
    await expiry.selectOption("custom");
    await page.getByLabel("Days (1–30)").fill(String(days));
  }
  await page.getByLabel("Require PIN").setChecked(requirePin);
  const issued = page.waitForResponse(response => response.url() === `${api}/api/messages/client` && response.request().method() === "POST");
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await issued;
  assert.equal(response.status(), 200);
  const { url: expected, expiresAt, pin } = await response.json();
  assertExpiry(expiresAt, days);
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await page.getByText("Chat link copied.").waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
  if (requirePin) {
    assert.match(pin, /^\d{6}$/);
    assert.ok(!expected.includes(`#${pin}`));
    await page.getByRole("button", { name: "Copy PIN", exact: true }).click();
    await page.getByText("PIN copied.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), pin);
    return { link: expected, pin };
  }
  assert.equal(pin, null);
  return expected;
}
async function browserSession(user) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  if (user) {
    await page.goto(`${url}/login`);
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${url}/app`);
  }
  return { context, page };
}
async function send(page, text) {
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText(text, { exact: true }).waitFor();
}

async function attach(page, file, caption) {
  await page.getByLabel("Attachment file").setInputFiles(file);
  if (caption) await page.getByRole("textbox", { name: "Message", exact: true }).fill(caption);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: `Download ${file.name}`, exact: true }).waitFor();
}

async function assertDownload(page, file) {
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: `Download ${file.name}`, exact: true }).click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(), file.name);
  assert.deepEqual(await readFile(await download.path()), file.buffer);
}

try {
  const [org, outsiderOrg] = await Promise.all(["team", "outsider"].map(async label => {
    const created = await prisma.organization.create({ data: { slug: `${label}-${tag}`, name: `Chat ${label}` } });
    orgIds.push(created.id);
    return created;
  }));
  const [alice, bob, outsider] = await Promise.all([
    ["Alice Chat", org], ["Bob Chat", org], ["Outsider Chat", outsiderOrg],
  ].map(([name, team], i) => createUserWithPassword({
    name, email: `user-${i}-${tag}@example.test`, password, organizationId: team.id, role: "owner",
  })));
  const lead = await prisma.lead.create({ data: {
    organizationId: org.id, assignedToId: alice.id, name: "Client Chat",
  } });
  const [a, b, o, c] = await Promise.all([alice, bob, outsider, null].map(browserSession));
  await Promise.all([a, b].map(({ page }) => page.goto(`${url}/app/messages`)));
  await a.page.getByRole("button", { name: "New DM" }).click();
  await a.page.getByLabel("Teammate").selectOption(bob.id);
  await a.page.getByRole("button", { name: "Open DM" }).click();
  await send(a.page, "Can you cover the viewing?");
  await b.page.getByRole("button", { name: /Alice Chat.*1 unread/ }).waitFor({ timeout: 15000 });
  await b.page.getByRole("button", { name: /Alice Chat/ }).click();
  await b.page.getByRole("button", { name: /Alice Chat.*1 unread/ }).waitFor({ state: "hidden", timeout: 15000 });
  await send(b.page, "Yes, I can cover it.");
  await a.page.getByText("Yes, I can cover it.", { exact: true }).waitFor({ timeout: 15000 });
  const dm = (await (await a.context.request.get(`${api}/api/messages`)).json()).find(row => row.kind === "team");
  assert.equal((await o.context.request.get(`${api}/api/messages/${dm.id}`)).status(), 404);
  assert.equal((await o.context.request.post(`${api}/api/messages/team`, { data: { teammateId: bob.id } })).status(), 404);
  const requestId = randomUUID();
  const payload = { body: "Retry-safe message", requestId };
  const sendPath = `${api}/api/messages/${dm.id}/send`;
  const [first, duplicate] = await Promise.all([1, 2].map(() => a.context.request.post(sendPath, { data: payload })));
  assert.equal(first.status(), 200);
  assert.equal(duplicate.status(), 200);
  assert.equal((await first.json()).id, (await duplicate.json()).id);
  const pdfFile = { name: "Viewing brochure.pdf", mimeType: "application/pdf", buffer: await buildGuidePdf({
    org: { name: "Test Realty" }, title: "Viewing brochure", subtitle: "", audienceLabel: "Buyer", intro: "Property details",
    chapters: [{ title: "Property", blocks: [{ type: "p", text: "Two bedrooms." }] }], closing: { heading: "Next", text: "Book a viewing." },
  }) };
  await attach(a.page, pdfFile);
  await assertDownload(b.page, pdfFile);
  const dmFiles = await (await a.context.request.get(`${api}/api/messages/${dm.id}`)).json();
  const pdfMessage = dmFiles.messages.find(message => message.attachment?.fileName === pdfFile.name);
  assert.deepEqual(Object.keys(pdfMessage.attachment).sort(), ["contentType", "fileName", "size"]);
  assert.equal((await o.context.request.get(`${api}/api/messages/${dm.id}/attachments/${pdfMessage.id}`)).status(), 404);
  const badFile = await a.context.request.post(sendPath, { multipart: {
    requestId: randomUUID(), attachment: { name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<html>not an image</html>") },
  } });
  assert.equal(badFile.status(), 400);
  const oversized = await a.context.request.post(sendPath, { multipart: {
    requestId: randomUUID(), attachment: { name: "large.txt", mimeType: "text/plain", buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 65) },
  } });
  assert.equal(oversized.status(), 413);
  console.log("Team DM: file-only message downloaded. Spoofed, oversized, and cross-brokerage file requests rejected.");

  await a.page.goto(`${url}/app/leads?lead=${lead.id}`);
  await a.page.getByRole("link", { name: "Client chat" }).click();
  assert.equal(await a.page.getByLabel("Link expiry").inputValue(), "7");
  const oldLink = await createLink(a, "Create chat link");
  const { link, pin } = await createLink(a, "Create new chat link", null, true);
  assert.equal((await a.context.request.post(`${api}/api/messages/client`, { data: { leadId: lead.id, expiryDays: 31 } })).status(), 400);
  const chatId = new URL(link).pathname.split("/").pop();
  const oneTimeToken = new URL(link).hash.slice(1);
  assert.equal((await c.context.request.post(`${api}/api/client-chat/${chatId}/session`, { data: { token: new URL(oldLink).hash.slice(1) } })).status(), 401);
  assert.equal((await o.context.request.post(`${api}/api/messages/client`, { data: { leadId: lead.id } })).status(), 404);
  assert.equal((await c.context.request.get(`${api}/api/client-chat/${chatId}`)).status(), 401);
  assert.equal((await o.context.request.get(`${api}/api/messages/${chatId}`)).status(), 404);
  const stored = await prisma.clientChatPass.findFirstOrThrow({ where: { conversationId: chatId } });
  assert.match(stored.pinDigest, /^[a-f0-9]{64}$/);
  assert.notEqual(stored.pinDigest, pin);
  const wrongPin = pin === "000000" ? "111111" : "000000";
  await c.page.goto(link);
  await c.page.getByRole("button", { name: "Open private chat" }).click();
  await c.page.getByLabel("Chat PIN").fill(wrongPin);
  await c.page.getByRole("button", { name: "Open private chat" }).click();
  await c.page.getByText("That PIN is incorrect. Try again.").waitFor();
  await c.page.getByLabel("Chat PIN").fill(pin);
  await c.page.getByRole("button", { name: "Open private chat" }).click();
  await c.page.getByRole("heading", { name: "Chat team" }).waitFor();
  const session = await prisma.clientChatPass.findFirstOrThrow({ where: { conversationId: chatId, isSession: true } });
  assertExpiry(session.expiresAt, 30);
  assert.equal((await c.context.request.post(`${api}/api/client-chat/${chatId}/session`, { data: { token: oneTimeToken } })).status(), 401);
  await send(c.page, "Can we see the second apartment?");
  await a.page.getByText("Can we see the second apartment?", { exact: true }).waitFor({ timeout: 15000 });
  await send(a.page, "Saturday at 11 works.");
  await c.page.getByText("Saturday at 11 works.", { exact: true }).waitFor({ timeout: 15000 });
  const photo = { name: "Apartment photo.png", mimeType: "image/png", buffer: png };
  await attach(c.page, photo, "This is the apartment I liked.");
  await a.page.getByRole("button", { name: "Preview image", exact: true }).click();
  const preview = a.page.getByRole("img", { name: photo.name, exact: true });
  await preview.waitFor();
  await a.page.waitForFunction(() => document.querySelector('img[alt="Apartment photo.png"]')?.naturalWidth > 0);
  await assertDownload(a.page, photo);
  const clientFiles = await (await a.context.request.get(`${api}/api/messages/${chatId}`)).json();
  const photoMessage = clientFiles.messages.find(message => message.attachment?.fileName === photo.name);
  const clientFilePath = `${api}/api/client-chat/${chatId}/attachments/${photoMessage.id}`;
  const clientSession = await c.page.evaluate(id => sessionStorage.getItem(`atrium-chat:${id}`), chatId);
  assert.equal((await o.context.request.get(clientFilePath)).status(), 401);
  assert.equal((await a.context.request.get(`${api}/api/messages/${chatId}/attachments/${pdfMessage.id}`)).status(), 404);
  await attach(a.page, { ...pdfFile, name: "Client brochure.pdf" }, "Here is the brochure.");
  await assertDownload(c.page, { ...pdfFile, name: "Client brochure.pdf" });
  console.log("Client chat: two-way attachments, private image preview, and download verified.");

  assert.equal((await a.context.request.post(`${api}/api/leads/bulk`, {
    data: { action: "assign", ids: [lead.id], assignedToId: bob.id },
  })).status(), 200);
  assert.equal((await a.context.request.get(`${api}/api/messages/${chatId}`)).status(), 404);
  await b.page.getByRole("button", { name: /^Clients/ }).click();
  await b.page.getByRole("button", { name: /Client Chat/ }).click();
  await b.page.getByText("Can we see the second apartment?", { exact: true }).waitFor();
  await b.page.getByRole("button", { name: "Revoke access" }).click();
  await b.page.getByText("Client access revoked.").waitFor();
  await c.page.getByText(/Your session has ended/).waitFor({ timeout: 15000 });
  assert.equal((await c.context.request.get(clientFilePath, { headers: { Authorization: `Bearer ${clientSession}` } })).status(), 401);
  assert.equal((await a.context.request.get(`${api}/api/messages/${chatId}/attachments/${photoMessage.id}`)).status(), 404);
  assert.equal(await prisma.clientChatPass.count({ where: { conversationId: chatId } }), 0);
  const replacement = await createLink(b, "Create chat link", 30);
  await c.page.goto(replacement);
  await c.page.getByRole("button", { name: "Open private chat" }).click();
  await c.page.getByText("Saturday at 11 works.", { exact: true }).waitFor();
  await c.page.getByRole("button", { name: "Sign out" }).click();
  const lockedInvite = await createLink(b, "Create new chat link", 7, true);
  const lockedToken = new URL(lockedInvite.link).hash.slice(1);
  const invalidPin = lockedInvite.pin === "000000" ? "111111" : "000000";
  const exchange = `${api}/api/client-chat/${chatId}/session`;
  const guesses = await Promise.all(Array.from({ length: 5 }, () =>
    c.context.request.post(exchange, { data: { token: lockedToken, pin: invalidPin } })));
  assert.deepEqual(guesses.map(response => response.status()).sort(), [401, 403, 403, 403, 403]);
  assert.equal((await c.context.request.post(exchange, { data: { token: lockedToken, pin: lockedInvite.pin } })).status(), 401);
  const recovered = await createLink(b, "Create new chat link", 12);
  await c.page.goto(recovered);
  await c.page.getByRole("button", { name: "Open private chat" }).click();
  await c.page.getByText("Saturday at 11 works.", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PIN prompt, separate clipboard values, attempt limit, handoff, revocation, and invite expiry passed. No browser exceptions.");
} finally {
  await browser.close();
  await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.$disconnect();
}
