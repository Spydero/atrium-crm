import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { parseChatAttachment, parseChatMessage, type OutgoingMessage } from "../lib/chatAttachments.js";
import { RateLimiter } from "../lib/guideTools.js";

export const messagesRouter = Router();
export const clientChatRouter = Router();
for (const router of [messagesRouter, clientChatRouter]) {
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
}
messagesRouter.use(requireAuth);

const clientReader = "client";
const dayMs = 24 * 3600_000;
const sessionDays = 30;
const maxPinAttempts = 5;
const readSchema = z.object({ lastMessageId: z.number().int().positive().max(2147483647) });
const linkLimiter = new RateLimiter(25, 15 * 60_000);
const inviteLimiter = new RateLimiter(10, 15 * 60_000);
const clientSendLimiter = new RateLimiter(40, 60_000);
const staffSendLimiter = new RateLimiter(60, 60_000);
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const chatPin = z.string().regex(/^\d{6}$/);
function digestPin(invite: string, pin: string, secret: string) {
  return createHmac("sha256", secret).update(`atrium-client-chat-pin:${invite}:${pin}`).digest();
}

const validToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const leadSummary = { id: true, name: true, assignedToId: true } as const;
const attachmentFields = { fileName: true, contentType: true, size: true } as const;
const messageFields = {
  id: true, senderId: true, senderName: true, body: true, createdAt: true,
  attachment: { select: attachmentFields },
} as const;
type Db = Prisma.TransactionClient;

function staff(req: AuthedRequest) {
  const user = req.session?.user;
  if (!user?.organizationId) return null;
  return { id: user.id, organizationId: user.organizationId, name: user.name };
}

function staffScope(user: NonNullable<ReturnType<typeof staff>>): Prisma.ConversationWhereInput {
  return { organizationId: user.organizationId, OR: [
    { teamAId: user.id }, { teamBId: user.id }, { lead: { assignedToId: user.id } },
  ] };
}

async function locked<T>(id: string, work: (tx: Db) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Conversation" WHERE "id" = ${id} FOR UPDATE`;
    return work(tx);
  });
}

async function chatPage(id: string, readerId: string, req: Request) {
  const cursor = z.coerce.number().int().positive().max(2147483647);
  const before = cursor.safeParse(req.query.before);
  const after = cursor.safeParse(req.query.after);
  const rows = await prisma.chatMessage.findMany({
    where: {
      conversationId: id,
      ...(after.success ? { id: { gt: after.data } } : before.success ? { id: { lt: before.data } } : {}),
    },
    orderBy: { id: after.success ? "asc" : "desc" }, take: 51, select: messageFields,
  });
  const page = rows.slice(0, 50);
  if (!after.success) page.reverse();
  const messages = page.map(({ senderId, ...message }) => ({
    ...message, mine: readerId === clientReader ? senderId === null : senderId === readerId,
  }));
  return {
    messages,
    nextBefore: !after.success && rows.length > 50 ? messages[0].id : null,
    nextAfter: after.success && rows.length > 50 ? messages[49].id : null,
  };
}

async function markRead(id: string, readerId: string, lastMessageId: number, db: Db = prisma) {
  const message = await db.chatMessage.findFirst({ where: { conversationId: id, id: lastMessageId }, select: { id: true } });
  if (!message) return false;
  await db.$executeRaw`
    INSERT INTO "ChatRead" ("conversationId", "readerId", "lastMessageId") VALUES (${id}, ${readerId}, ${lastMessageId})
    ON CONFLICT ("conversationId", "readerId") DO UPDATE
    SET "lastMessageId" = GREATEST("ChatRead"."lastMessageId", EXCLUDED."lastMessageId")`;
  return true;
}

async function addMessage(tx: Db, id: string, senderId: string | null, senderName: string, data: OutgoingMessage) {
  const { attachment, ...fields } = data;
  const existing = await tx.chatMessage.findUnique({
    where: { conversationId_requestId: { conversationId: id, requestId: data.requestId } },
    select: { ...messageFields, attachment: { select: { ...attachmentFields, digest: true } } },
  });
  if (existing) {
    if (existing.senderId !== senderId || existing.body !== data.body ||
        existing.attachment?.digest !== attachment?.digest ||
        existing.attachment?.fileName !== attachment?.fileName) return null;
    const { attachment: stored, ...message } = existing;
    return { ...message, attachment: stored && { fileName: stored.fileName, contentType: stored.contentType, size: stored.size } };
  }
  const message = await tx.chatMessage.create({
    data: { conversationId: id, senderId, senderName, ...fields, ...(attachment ? { attachment: { create: attachment } } : {}) },
    select: messageFields,
  });
  await tx.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
  return message;
}

async function sendAttachment(res: Response, id: string, rawMessageId: string) {
  const parsed = z.coerce.number().int().positive().max(2147483647).safeParse(rawMessageId);
  if (!parsed.success) return res.sendStatus(404);
  const file = await prisma.chatAttachment.findFirst({
    where: { messageId: parsed.data, message: { conversationId: id } },
    select: { fileName: true, contentType: true, content: true },
  });
  if (!file) return res.sendStatus(404);
  res.attachment(file.fileName);
  res.set("Content-Type", file.contentType);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Security-Policy", "default-src 'none'; sandbox");
  res.send(Buffer.from(file.content));
}

messagesRouter.get("/teammates", async (req: AuthedRequest, res) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  res.json(await prisma.user.findMany({
    where: { organizationId: user.organizationId, id: { not: user.id }, disabledAt: null },
    select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }],
  }));
});

messagesRouter.get("/unread", async (req: AuthedRequest, res) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  const [row] = await prisma.$queryRaw<{ unread: number }[]>`
    SELECT COUNT(m."id")::int AS unread
    FROM "Conversation" c
    LEFT JOIN "Lead" l ON l."id" = c."leadId"
    LEFT JOIN "ChatRead" r ON r."conversationId" = c."id" AND r."readerId" = ${user.id}
    JOIN "ChatMessage" m ON m."conversationId" = c."id"
       AND m."id" > COALESCE(r."lastMessageId", 0) AND m."senderId" IS DISTINCT FROM ${user.id}
    WHERE c."organizationId" = ${user.organizationId}
      AND (c."teamAId" = ${user.id} OR c."teamBId" = ${user.id} OR l."assignedToId" = ${user.id})`;
  res.json(row);
});

messagesRouter.get("/", async (req: AuthedRequest, res) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  const conversations = await prisma.conversation.findMany({
    where: staffScope(user), orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: {
      lead: { select: leadSummary },
      messages: { orderBy: { id: "desc" }, take: 1, select: messageFields },
      reads: { where: { readerId: user.id }, select: { lastMessageId: true } },
    },
  });
  const teammateIds = conversations.flatMap(c => c.teamAId && c.teamBId ? [c.teamAId === user.id ? c.teamBId : c.teamAId] : []);
  const teammates = new Map((await prisma.user.findMany({
    where: { id: { in: teammateIds }, organizationId: user.organizationId },
    select: { id: true, name: true, disabledAt: true },
  })).map(row => [row.id, row]));
  const unread = conversations.length ? await prisma.$queryRaw<{ id: string; count: number }[]>`
    SELECT c."id", COUNT(m."id")::int AS count
    FROM "Conversation" c
    LEFT JOIN "ChatRead" r ON r."conversationId" = c."id" AND r."readerId" = ${user.id}
    JOIN "ChatMessage" m ON m."conversationId" = c."id"
       AND m."id" > COALESCE(r."lastMessageId", 0) AND m."senderId" IS DISTINCT FROM ${user.id}
    WHERE c."id" IN (${Prisma.join(conversations.map(c => c.id))}) GROUP BY c."id"` : [];
  const counts = new Map(unread.map(row => [row.id, row.count]));
  res.json(conversations.map(c => {
    const teammate = teammates.get((c.teamAId === user.id ? c.teamBId : c.teamAId) ?? "");
    return {
      id: c.id, kind: c.lead ? "client" : "team",
      title: c.lead?.name ?? teammate?.name ?? "Former teammate",
      leadId: c.leadId,
      accessEnabled: c.accessEnabled, canSend: c.lead ? c.accessEnabled : Boolean(teammate && !teammate.disabledAt),
      unread: counts.get(c.id) ?? 0, latest: c.messages[0] ?? null,
    };
  }));
});

messagesRouter.post("/team", async (req: AuthedRequest, res) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  const parsed = z.object({ teammateId: z.string().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success || parsed.data.teammateId === user.id) return res.status(400).json({ error: "Choose an active teammate." });
  const teammate = await prisma.user.findFirst({
    where: { id: parsed.data.teammateId, organizationId: user.organizationId, disabledAt: null },
    select: { id: true },
  });
  if (!teammate) return res.sendStatus(404);
  const [teamAId, teamBId] = [user.id, teammate.id].sort();
  const key = { organizationId: user.organizationId, teamAId, teamBId };
  const result = await prisma.conversation.upsert({
    where: { organizationId_teamAId_teamBId: key }, create: key, update: {}, select: { id: true },
  });
  res.json(result);
});

messagesRouter.get("/lead/:id", async (req: AuthedRequest, res) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  const lead = await prisma.lead.findFirst({
    where: { id: String(req.params.id), organizationId: user.organizationId, assignedToId: user.id },
    select: { id: true, name: true },
  });
  if (!lead) return res.status(404).json({ error: "Client chat is available to the assigned broker." });
  res.json(lead);
});

messagesRouter.post("/client", async (req: AuthedRequest, res) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  const parsed = z.object({
    leadId: z.string().min(1).max(100),
    expiryDays: z.number().int().min(1).max(30).nullable().default(7),
    requirePin: z.boolean().default(false),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a lead and an expiry of 1–30 days or No expiry." });
  const lead = await prisma.lead.findFirst({
    where: { id: parsed.data.leadId, organizationId: user.organizationId, assignedToId: user.id },
    select: { id: true },
  });
  if (!lead) return res.status(404).json({ error: "Only the assigned broker can create a chat link." });
  if (!inviteLimiter.allow(`${user.id}:${lead.id}`)) return res.status(429).json({ error: "Too many links. Try again in 15 minutes." });
  const origin = new URL(process.env.CLIENT_ORIGIN || "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") {
    return res.status(503).json({ error: "Set a public HTTPS CRM address before sharing chat links." });
  }
  const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
  if (parsed.data.requirePin && !secret) return res.status(503).json({ error: "PIN protection is unavailable. Ask your Atrium administrator to check the authentication configuration." });
  const pin = parsed.data.requirePin ? randomInt(1_000_000).toString().padStart(6, "0") : null;
  const conversation = await prisma.conversation.upsert({
    where: { leadId: lead.id },
    create: { organizationId: user.organizationId, leadId: lead.id },
    update: {}, select: { id: true },
  });
  const raw = token();
  const expiresAt = parsed.data.expiryDays === null ? null : new Date(Date.now() + parsed.data.expiryDays * dayMs);
  const issued = await locked(conversation.id, async tx => {
    const current = await tx.conversation.findFirst({
      where: { id: conversation.id, organizationId: user.organizationId, lead: { assignedToId: user.id }, organization: { status: "ACTIVE" } },
      select: { accessVersion: true },
    });
    if (!current) return false;
    await tx.clientChatPass.deleteMany({
      where: { conversationId: conversation.id, OR: [{ isSession: false }, { expiresAt: { lte: new Date() } }] },
    });
    await tx.clientChatPass.create({ data: {
      hash: hash(raw), conversationId: conversation.id, version: current.accessVersion, expiresAt,
      pinDigest: pin && secret ? digestPin(raw, pin, secret).toString("hex") : null,
    } });
    await tx.conversation.update({ where: { id: conversation.id }, data: { accessEnabled: true } });
    return true;
  });
  if (!issued) return res.sendStatus(404);
  const link = new URL(`/chat/${conversation.id}`, origin);
  link.hash = raw;
  res.json({ id: conversation.id, url: link.toString(), expiresAt, pin });
});

messagesRouter.post("/:id/revoke", async (req: AuthedRequest, res) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  const id = String(req.params.id);
  const revoked = await locked(id, async tx => {
    const result = await tx.conversation.updateMany({
      where: { id, leadId: { not: null }, ...staffScope(user) },
      data: { accessEnabled: false, accessVersion: { increment: 1 } },
    });
    if (result.count) await tx.clientChatPass.deleteMany({ where: { conversationId: id } });
    return result.count;
  });
  res.sendStatus(revoked ? 204 : 404);
});

messagesRouter.get("/:id", async (req: AuthedRequest, res) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  const id = String(req.params.id);
  if (!await prisma.conversation.findFirst({ where: { id, ...staffScope(user) }, select: { id: true } })) return res.sendStatus(404);
  res.json(await chatPage(id, user.id, req));
});

messagesRouter.post("/:id/read", async (req: AuthedRequest, res) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  const id = String(req.params.id);
  const parsed = readSchema.safeParse(req.body);
  if (!parsed.success) return res.sendStatus(400);
  if (!await prisma.conversation.findFirst({ where: { id, ...staffScope(user) }, select: { id: true } })) return res.sendStatus(404);
  res.sendStatus(await markRead(id, user.id, parsed.data.lastMessageId) ? 204 : 400);
});

messagesRouter.get("/:id/attachments/:messageId", async (req: AuthedRequest, res) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  const id = String(req.params.id);
  if (!await prisma.conversation.findFirst({ where: { id, ...staffScope(user) }, select: { id: true } })) return res.sendStatus(404);
  return sendAttachment(res, id, String(req.params.messageId));
});

messagesRouter.post("/:id/send", async (req: AuthedRequest, res, next) => {
  const user = staff(req);
  if (!user) return res.sendStatus(403);
  if (!staffSendLimiter.allow(user.id)) return res.sendStatus(429);
  if (req.is("multipart/form-data") && !await prisma.conversation.findFirst({
    where: { id: String(req.params.id), ...staffScope(user) }, select: { id: true },
  })) return res.sendStatus(404);
  next();
}, parseChatAttachment, async (req: AuthedRequest, res) => {
  const user = staff(req)!;
  const id = String(req.params.id);
  const parsed = parseChatMessage(req.body, req.file);
  if ("error" in parsed) return res.status(parsed.status ?? 400).json({ error: parsed.error });
  const outcome = await locked(id, async tx => {
    const conversation = await tx.conversation.findFirst({
      where: { id, ...staffScope(user) },
      select: { leadId: true, accessEnabled: true, teamAId: true, teamBId: true },
    });
    if (!conversation) return { status: 404 as const };
    if (conversation.leadId && !conversation.accessEnabled) {
      return { status: 409 as const, error: "Client chat access is inactive." };
    }
    if (!conversation.leadId && !await tx.user.findFirst({
      where: { id: conversation.teamAId === user.id ? conversation.teamBId! : conversation.teamAId!, organizationId: user.organizationId, disabledAt: null },
      select: { id: true },
    })) return { status: 409 as const, error: "This teammate is no longer active." };
    const message = await addMessage(tx, id, user.id, user.name, parsed);
    return { status: 200 as const, message };
  });
  if (outcome.status !== 200) return res.status(outcome.status).json({ error: outcome.error ?? "Conversation unavailable." });
  if (!outcome.message) return res.status(409).json({ error: "This message could not be saved. Try composing it again." });
  res.json({ ...outcome.message, mine: true });
});

async function getClientConversation(id: string, db: Db = prisma) {
  const conversation = await db.conversation.findFirst({
    where: { id, leadId: { not: null }, accessEnabled: true, organization: { status: "ACTIVE" } },
    select: {
      id: true, accessVersion: true, lead: { select: leadSummary },
      organization: { select: { name: true } },
    },
  });
  return conversation;
}

async function clientAccess(id: string, req: Request, db: Db = prisma) {
  const auth = validToken.safeParse(req.get("Authorization")?.replace(/^Bearer /, ""));
  if (!auth.success) return null;
  const pass = await db.clientChatPass.findFirst({
    where: { hash: hash(auth.data), conversationId: id, isSession: true, expiresAt: { gt: new Date() } },
  });
  if (!pass) return null;
  const conversation = await getClientConversation(id, db);
  return conversation?.accessVersion === pass.version ? conversation : null;
}

clientChatRouter.post("/:id/session", async (req, res) => {
  const parsed = z.object({ token: validToken, pin: chatPin.optional() }).safeParse(req.body);
  if (!parsed.success) return res.sendStatus(400);
  if (!linkLimiter.allow(`exchange:${req.ip ?? "unknown"}`)) return res.sendStatus(429);
  const id = String(req.params.id);
  const raw = token();
  const session = await locked(id, async tx => {
    const pass = await tx.clientChatPass.findFirst({
      where: {
        hash: hash(parsed.data.token), conversationId: id, isSession: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!pass) return "invalid";
    const conversation = await getClientConversation(id, tx);
    if (!conversation || conversation.accessVersion !== pass.version) return "invalid";
    if (pass.pinDigest) {
      const pin = parsed.data.pin;
      if (!pin) return "pin_required";
      const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
      if (!secret) return "unavailable";
      const supplied = digestPin(parsed.data.token, pin, secret);
      if (!timingSafeEqual(supplied, Buffer.from(pass.pinDigest, "hex"))) {
        if (pass.failedPinAttempts + 1 >= maxPinAttempts) {
          await tx.clientChatPass.delete({ where: { hash: pass.hash } });
          return "pin_locked";
        }
        await tx.clientChatPass.update({ where: { hash: pass.hash }, data: { failedPinAttempts: { increment: 1 } } });
        return "pin_wrong";
      }
    }
    await tx.clientChatPass.delete({ where: { hash: pass.hash } });
    await tx.clientChatPass.create({ data: {
      hash: hash(raw), conversationId: id, version: pass.version, isSession: true,
      expiresAt: new Date(Date.now() + sessionDays * dayMs),
    } });
    return "opened";
  });
  if (session === "pin_required" || session === "pin_wrong") {
    return res.status(403).json({
      error: session === "pin_required" ? "Enter the PIN your broker shared separately." : "That PIN is incorrect. Try again.",
      code: "PIN_REQUIRED",
    });
  }
  if (session === "unavailable") return res.status(503).json({ error: "PIN verification is unavailable. Try again later." });
  if (session === "pin_locked") return res.status(401).json({ error: "Too many incorrect PIN attempts. Ask your broker for a new chat link." });
  if (session !== "opened") return res.status(401).json({ error: "This sign-in link has expired or already been used." });
  res.json({ token: raw });
});

clientChatRouter.delete("/:id/session", async (req, res) => {
  const auth = validToken.safeParse(req.get("Authorization")?.replace(/^Bearer /, ""));
  if (auth.success) await prisma.clientChatPass.deleteMany({
    where: { hash: hash(auth.data), conversationId: String(req.params.id), isSession: true },
  });
  res.sendStatus(204);
});

clientChatRouter.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  const conversation = await clientAccess(id, req);
  if (!conversation) return res.sendStatus(401);
  res.json({ organization: conversation.organization.name, ...await chatPage(id, clientReader, req) });
});

clientChatRouter.post("/:id/read", async (req, res) => {
  const id = String(req.params.id);
  const parsed = readSchema.safeParse(req.body);
  if (!parsed.success) return res.sendStatus(400);
  const status = await locked(id, async tx => {
    if (!await clientAccess(id, req, tx)) return 401;
    return await markRead(id, clientReader, parsed.data.lastMessageId, tx) ? 204 : 400;
  });
  res.sendStatus(status);
});

clientChatRouter.get("/:id/attachments/:messageId", async (req, res) => {
  const id = String(req.params.id);
  if (!await clientAccess(id, req)) return res.sendStatus(401);
  return sendAttachment(res, id, String(req.params.messageId));
});

clientChatRouter.post("/:id/send", async (req, res, next) => {
  const id = String(req.params.id);
  if (!await clientAccess(id, req)) return res.sendStatus(401);
  if (!clientSendLimiter.allow(id)) return res.status(429).json({ error: "Too many messages. Try again in a minute." });
  next();
}, parseChatAttachment, async (req, res) => {
  const id = String(req.params.id);
  const parsed = parseChatMessage(req.body, req.file);
  if ("error" in parsed) return res.status(parsed.status ?? 400).json({ error: parsed.error });
  const outcome = await locked(id, async tx => {
    const conversation = await clientAccess(id, req, tx);
    if (!conversation?.lead) return null;
    const message = await addMessage(tx, id, null, conversation.lead.name, parsed);
    return { message };
  });
  if (!outcome) return res.sendStatus(401);
  if (!outcome.message) return res.status(409).json({ error: "This message could not be saved. Try composing it again." });
  res.json({ ...outcome.message, mine: true });
});
