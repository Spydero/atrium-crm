export type EventType = "VIEWING" | "CALL" | "FOLLOW_UP" | "TASK";
export type EventOutcome = "SCHEDULED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
export type CancelReason =
  | "CLIENT"
  | "AGENT"
  | "LANDLORD"
  | "LISTING_UNAVAILABLE"
  | "RESCHEDULED"
  | "DUPLICATE"
  | "OTHER";

export const CANCEL_REASON_OPTIONS: { id: CancelReason; label: string }[] = [
  { id: "CLIENT", label: "Client" },
  { id: "AGENT", label: "Agent" },
  { id: "LANDLORD", label: "Landlord" },
  { id: "LISTING_UNAVAILABLE", label: "Listing unavailable" },
  { id: "RESCHEDULED", label: "Rescheduled" },
  { id: "DUPLICATE", label: "Duplicate" },
  { id: "OTHER", label: "Other" },
];

export function typeLabel(type: EventType): string {
  return (
    {
      VIEWING: "Viewing",
      CALL: "Call",
      FOLLOW_UP: "Follow-up",
      TASK: "Task",
    } as const
  )[type];
}

export function outcomeLabel(type: EventType, outcome: EventOutcome): string {
  if (outcome === "SCHEDULED") {
    return type === "FOLLOW_UP" || type === "TASK" ? "Open" : "Scheduled";
  }
  if (outcome === "COMPLETED") {
    if (type === "CALL") return "Connected";
    if (type === "FOLLOW_UP" || type === "TASK") return "Done";
    return "Completed";
  }
  if (outcome === "NO_SHOW") return type === "CALL" ? "No answer" : "No-show";
  return "Cancelled";
}

export function outcomeShort(type: EventType, outcome: EventOutcome): string {
  if (outcome === "SCHEDULED") return "";
  if (outcome === "COMPLETED") {
    if (type === "CALL") return "Connected";
    if (type === "FOLLOW_UP" || type === "TASK") return "Done";
    return "Done";
  }
  if (outcome === "NO_SHOW") return type === "CALL" ? "No answer" : "No-show";
  return "Cancelled";
}

export function allowsNoShow(type: EventType): boolean {
  return type === "VIEWING" || type === "CALL";
}

export function cancelReasonLabel(reason: CancelReason): string {
  return CANCEL_REASON_OPTIONS.find((r) => r.id === reason)?.label ?? reason;
}
