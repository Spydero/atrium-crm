import type { CalendarEventType, ViewingOutcome, CancelReason } from "@prisma/client";

/** Shared labels for calendar outcomes. ViewingOutcome is reused for every event type. */
export type EventOutcome = ViewingOutcome;

export const CANCEL_REASONS: CancelReason[] = [
  "CLIENT",
  "AGENT",
  "LANDLORD",
  "LISTING_UNAVAILABLE",
  "RESCHEDULED",
  "DUPLICATE",
  "OTHER",
];

export function typeLabel(type: CalendarEventType): string {
  return (
    {
      VIEWING: "Viewing",
      CALL: "Call",
      FOLLOW_UP: "Follow-up",
      TASK: "Task",
    } as const
  )[type];
}

export function outcomeLabel(type: CalendarEventType, outcome: EventOutcome): string {
  if (outcome === "SCHEDULED") {
    return type === "FOLLOW_UP" || type === "TASK" ? "Open" : "Scheduled";
  }
  if (outcome === "COMPLETED") {
    if (type === "CALL") return "Connected";
    if (type === "FOLLOW_UP" || type === "TASK") return "Done";
    return "Completed";
  }
  if (outcome === "NO_SHOW") {
    return type === "CALL" ? "No answer" : "No-show";
  }
  return "Cancelled";
}

export function outcomeShort(type: CalendarEventType, outcome: EventOutcome): string {
  if (outcome === "SCHEDULED") return "";
  if (outcome === "COMPLETED") {
    if (type === "CALL") return "Connected";
    if (type === "FOLLOW_UP" || type === "TASK") return "Done";
    return "Done";
  }
  if (outcome === "NO_SHOW") return type === "CALL" ? "No answer" : "No-show";
  return "Cancelled";
}

export function cancelReasonLabel(reason: CancelReason): string {
  return (
    {
      CLIENT: "Client",
      AGENT: "Agent",
      LANDLORD: "Landlord",
      LISTING_UNAVAILABLE: "Listing unavailable",
      RESCHEDULED: "Rescheduled",
      DUPLICATE: "Duplicate",
      OTHER: "Other",
    } as const
  )[reason];
}

export function allowsNoShow(type: CalendarEventType): boolean {
  return type === "VIEWING" || type === "CALL";
}
