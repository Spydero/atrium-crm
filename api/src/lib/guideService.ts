import { prisma } from "./prisma.js";
import { phoneKey } from "./leadTools.js";
import { consentWording, CONSENT_VERSION, makeToken, nextBusinessDay } from "./guideTools.js";

export type GuideRequestInput = {
  name: string;
  email: string;
  phone?: string | null;
  consentMarketing: boolean;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
  ipHash?: string | null;
};

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

/**
 * Handle one "send me the guide" submission in a single transaction:
 * find or create the lead (same email or same phone fuses), log the source and activity,
 * store the request with its personal token and consent record, and add a follow-up for the owner.
 * `at` lets the demo seeder backdate requests.
 */
export async function recordGuideRequest(
  guide: { id: string; organizationId: string; title: string; ownerId: string | null },
  org: { name: string },
  input: GuideRequestInput,
  at: Date = new Date(),
) {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const key = phone ? phoneKey(phone) : null;

  return prisma.$transaction(async (tx) => {
    const matches = await tx.lead.findMany({
      where: {
        organizationId: guide.organizationId,
        OR: [
          { email: { equals: email, mode: "insensitive" } },
          ...(key ? [{ phone: { endsWith: key } }] : []),
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 1,
    });
    const existing = matches[0] ?? null;
    let leadId: string;
    let fused = false;

    if (existing) {
      fused = true;
      leadId = existing.id;
      await tx.leadSourceEvent.create({
        data: {
          leadId,
          source: "GUIDE",
          message: `Requested guide "${guide.title}"`,
          createdAt: at,
        },
      });
      await tx.activityEvent.create({
        data: {
          leadId,
          type: "guide",
          body: `Lead Fuse: requested the guide "${guide.title}" (matched by ${
            existing.email && existing.email.toLowerCase() === email ? "email" : "phone"
          }).`,
          createdAt: at,
        },
      });
      const fill: { email?: string; phone?: string } = {};
      if (!existing.email) fill.email = email;
      if (!existing.phone && phone) fill.phone = phone;
      if (Object.keys(fill).length) await tx.lead.update({ where: { id: leadId }, data: fill });
    } else {
      const lead = await tx.lead.create({
        data: {
          organizationId: guide.organizationId,
          name: input.name,
          email,
          phone,
          primarySource: "GUIDE",
          assignedToId: guide.ownerId,
          createdAt: at,
          sources: {
            create: { source: "GUIDE", message: `Requested guide "${guide.title}"`, createdAt: at },
          },
          activities: {
            create: {
              type: "created",
              body: `Lead captured from the guide "${guide.title}"`,
              createdAt: at,
            },
          },
        },
      });
      leadId = lead.id;
    }

    const request = await tx.guideRequest.create({
      data: {
        guideId: guide.id,
        leadId,
        token: makeToken(),
        name: input.name,
        email,
        phone,
        consentMarketing: input.consentMarketing,
        consentText: input.consentMarketing ? consentWording(org.name) : "",
        consentVersion: CONSENT_VERSION,
        consentAt: input.consentMarketing ? at : null,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        referrer: input.referrer ?? null,
        ipHash: input.ipHash ?? null,
        createdAt: at,
      },
    });

    const due = nextBusinessDay(at);
    await tx.calendarEvent.create({
      data: {
        organizationId: guide.organizationId,
        title: `Follow up: ${existing?.name ?? input.name} requested "${guide.title}"`,
        type: "FOLLOW_UP",
        startsAt: due,
        endsAt: new Date(due.getTime() + 15 * 60_000),
        leadId,
        outcome: "SCHEDULED",
        notes: `Guide request: ${guide.title}`,
        createdAt: at,
      },
    });

    return { request, leadId, fused };
  });
}
