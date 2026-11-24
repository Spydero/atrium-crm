import type { LeadStage } from "@prisma/client";

/** wonAt / lostAt patches when a lead moves between stages. */
export function stageClockPatch(
  from: LeadStage,
  to: LeadStage,
  existing: { wonAt: Date | null; lostAt: Date | null },
  now = new Date(),
): { wonAt?: Date | null; lostAt?: Date | null } {
  if (from === to) return {};
  if (to === "WON") {
    return { wonAt: existing.wonAt ?? now, lostAt: null };
  }
  if (to === "LOST") {
    return { lostAt: existing.lostAt ?? now, wonAt: null };
  }
  return { wonAt: null, lostAt: null };
}
