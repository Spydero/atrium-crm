import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { resolveDateRange } from "../lib/dateRange.js";
import { computeMoneyMap, monthKey, monthStart } from "../lib/moneyStats.js";
import { listOrgChannels, normalizeChannelKey } from "../lib/channels.js";

export const moneyRouter = Router();
moneyRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

function userId(req: AuthedRequest) {
  return req.session?.user?.id ?? null;
}

function parseMonth(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const d = monthStart(raw);
  if (Number.isNaN(d.getTime())) return null;
  return monthKey(d);
}

async function spendRowsForMonth(organizationId: string, month: string) {
  const monthDate = monthStart(month);
  const channels = await listOrgChannels(organizationId);
  const keys = channels.map((c) => c.key);
  const labelBy = new Map(channels.map((c) => [c.key, c.label]));

  const [rows, earlier] = await Promise.all([
    prisma.sourceSpend.findMany({
      where: { organizationId, month: monthDate },
      include: { updatedBy: { select: { name: true } } },
    }),
    prisma.sourceSpend.findMany({
      where: { organizationId, month: { lt: monthDate } },
      orderBy: { month: "desc" },
    }),
  ]);

  const bySource = new Map(rows.map((r) => [r.source, r]));
  return {
    month,
    channels: channels.map((c) => ({
      key: c.key,
      label: c.label,
      kind: c.kind,
      enabled: c.enabled,
    })),
    rows: keys.map((source) => {
      const exact = bySource.get(source);
      if (exact) {
        return {
          source,
          label: labelBy.get(source) || source,
          amount: exact.amount,
          inherited: false,
          fromMonth: month,
          updatedAt: exact.updatedAt,
          updatedBy: exact.updatedBy?.name ?? null,
        };
      }
      const prior = earlier.find((e) => e.source === source);
      if (prior) {
        return {
          source,
          label: labelBy.get(source) || source,
          amount: prior.amount,
          inherited: true,
          fromMonth: monthKey(prior.month),
          updatedAt: prior.updatedAt,
          updatedBy: null,
        };
      }
      return {
        source,
        label: labelBy.get(source) || source,
        amount: null,
        inherited: false,
        fromMonth: null,
        updatedAt: null,
        updatedBy: null,
      };
    }),
  };
}

moneyRouter.get("/map", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  if (req.query.attribution != null && req.query.attribution !== "all") {
    return res.status(400).json({ error: "Only attribution=all is supported right now" });
  }

  const range = resolveDateRange({
    range: req.query.range ?? "90d",
    from: req.query.from,
    to: req.query.to,
  });

  const map = await computeMoneyMap(organizationId, range);
  res.json(map);
});

moneyRouter.get("/spend", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const now = new Date();
  const month = parseMonth(req.query.month) ?? monthKey(now);
  res.json(await spendRowsForMonth(organizationId, month));
});

moneyRouter.put("/spend", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    entries: z
      .array(
        z.object({
          source: z.string().min(1).max(40),
          amount: z.number().int().min(0).max(100_000_000).nullable(),
        }),
      )
      .min(1)
      .max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const month = parseMonth(parsed.data.month);
  if (!month) return res.status(400).json({ error: "Invalid month" });

  const monthDate = monthStart(month);
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  if (monthDate.getTime() > nextMonth.getTime()) {
    return res.status(400).json({ error: "Month can be at most next month" });
  }

  const allowed = new Set((await listOrgChannels(organizationId)).map((c) => c.key));
  for (const e of parsed.data.entries) {
    const key = normalizeChannelKey(e.source);
    if (!allowed.has(key)) {
      return res.status(400).json({ error: `Unknown channel "${e.source}"` });
    }
  }

  const actorId = userId(req);
  await prisma.$transaction(
    parsed.data.entries.map((e) => {
      const source = normalizeChannelKey(e.source);
      if (e.amount == null) {
        return prisma.sourceSpend.deleteMany({
          where: { organizationId, source, month: monthDate },
        });
      }
      return prisma.sourceSpend.upsert({
        where: {
          organizationId_source_month: { organizationId, source, month: monthDate },
        },
        create: {
          organizationId,
          source,
          month: monthDate,
          amount: e.amount,
          updatedById: actorId,
        },
        update: { amount: e.amount, updatedById: actorId },
      });
    }),
  );

  res.json(await spendRowsForMonth(organizationId, month));
});
