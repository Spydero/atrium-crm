/** Minimal RFC 4180 CSV writer with spreadsheet formula-injection protection. */

export type CsvCell = string | number | boolean | null | undefined | Date;

function cellToString(v: CsvCell): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  let s = String(v);
  // Prevent formulas when opened in Excel / Sheets
  if (/^[=+@]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) {
    s = `'${s}`;
  }
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(cellToString).join(",")];
  for (const row of rows) lines.push(row.map(cellToString).join(","));
  // BOM so Excel opens UTF-8 correctly
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function csvFilename(base: string) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${base}-${y}${m}${day}.csv`;
}

export function labelize(value: string | null | undefined) {
  if (!value) return "";
  const map: Record<string, string> = {
    manual: "Manual",
    MANUAL: "Manual",
    referral: "Referral",
    REFERRAL: "Referral",
    website: "Website",
    WEBSITE: "Website",
    whatsapp: "WhatsApp",
    WHATSAPP: "WhatsApp",
    guide: "Guide",
    GUIDE: "Guide",
    NO_SHOW: "No-show",
    CANCELLED: "Cancelled",
    COMPLETED: "Completed",
    SCHEDULED: "Scheduled",
    UNLOGGED: "Unlogged",
    UPCOMING: "Upcoming",
  };
  if (map[value]) return map[value];
  const key = value.trim().toLowerCase();
  if (map[key]) return map[key];
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
