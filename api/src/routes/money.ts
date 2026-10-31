import { Router } from "express";
import { LeadSource } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { resolveDateRange } from "../lib/dateRange.js";
import { ALL_SOURCES, computeMoneyMap, monthKey, monthStart } from "../lib/moneyStats.js";

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
  const monthDate = monthStart(month);

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
  const result = ALL_SOURCES.map((source) => {
    const exact = bySource.get(source);
    if (exact) {
      return {
        source,
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
        amount: prior.amount,
        inherited: true,
        fromMonth: monthKey(prior.month),
        updatedAt: prior.updatedAt,
        updatedBy: null,
      };
    }
    return {
      source,
      amount: null,
      inherited: false,
      fromMonth: null,
      updatedAt: null,
      updatedBy: null,
    };
  });

  res.json({ month, rows: result });
});

moneyRouter.put("/spend", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    entries: z
      .array(
        z.object({
          source: z.nativeEnum(LeadSource),
          amount: z.number().int().min(0).max(100_000_000).nullable(),
        }),
      )
      .min(1)
      .max(ALL_SOURCES.length),
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

  const actorId = userId(req);
  await prisma.$transaction(
    parsed.data.entries.map((e) => {
      if (e.amount == null) {
        return prisma.sourceSpend.deleteMany({
          where: { organizationId, source: e.source, month: monthDate },
        });
      }
      return prisma.sourceSpend.upsert({
        where: {
          organizationId_source_month: { organizationId, source: e.source, month: monthDate },
        },
        create: {
          organizationId,
          source: e.source,
          month: monthDate,
          amount: e.amount,
          updatedById: actorId,
        },
        update: { amount: e.amount, updatedById: actorId },
      });
    }),
  );

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
  res.json({
    month,
    rows: ALL_SOURCES.map((source) => {
      const exact = bySource.get(source);
      if (exact) {
        return {
          source,
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
          amount: prior.amount,
          inherited: true,
          fromMonth: monthKey(prior.month),
          updatedAt: prior.updatedAt,
          updatedBy: null,
        };
      }
      return {
        source,
        amount: null,
        inherited: false,
        fromMonth: null,
        updatedAt: null,
        updatedBy: null,
      };
    }),
  });
});
