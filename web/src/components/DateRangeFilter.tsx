"use client";

import { useState } from "react";

export type DatePreset = "7d" | "14d" | "30d" | "90d" | "180d" | "365d" | "custom";

export type DateRangeValue = {
  preset: DatePreset;
  from: string;
  to: string;
};

const PRESETS: { id: Exclude<DatePreset, "custom">; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "14d", label: "14d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "180d", label: "6m" },
  { id: "365d", label: "1y" },
];

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoKey(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (n - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultDateRange(preset: Exclude<DatePreset, "custom"> = "7d"): DateRangeValue {
  const days = { "7d": 7, "14d": 14, "30d": 30, "90d": 90, "180d": 180, "365d": 365 }[preset];
  return { preset, from: daysAgoKey(days), to: todayKey() };
}

export function dateRangeQuery(range: DateRangeValue) {
  const params = new URLSearchParams();
  params.set("range", range.preset);
  if (range.preset === "custom") {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  return params.toString();
}

export function DateRangeFilter({
  value,
  onChange,
  label,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  label?: string;
}) {
  const [customOpen, setCustomOpen] = useState(value.preset === "custom");

  function pickPreset(id: Exclude<DatePreset, "custom">) {
    setCustomOpen(false);
    onChange(defaultDateRange(id));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && (
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          {label}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-line bg-paper p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`rounded-[6px] px-2.5 py-1.5 text-xs font-bold transition ${
              value.preset === p.id
                ? "bg-accent text-white"
                : "text-muted hover:bg-[#eef1f4] hover:text-ink"
            }`}
            onClick={() => pickPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`rounded-[6px] px-2.5 py-1.5 text-xs font-bold transition ${
            value.preset === "custom"
              ? "bg-accent text-white"
              : "text-muted hover:bg-[#eef1f4] hover:text-ink"
          }`}
          onClick={() => {
            setCustomOpen(true);
            onChange({
              preset: "custom",
              from: value.from || daysAgoKey(7),
              to: value.to || todayKey(),
            });
          }}
        >
          Custom
        </button>
      </div>

      {(customOpen || value.preset === "custom") && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="font-semibold">From</span>
            <input
              type="date"
              className="field py-1.5 text-xs"
              value={value.from}
              max={value.to || todayKey()}
              onChange={(e) =>
                onChange({
                  preset: "custom",
                  from: e.target.value,
                  to: value.to || todayKey(),
                })
              }
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="font-semibold">To</span>
            <input
              type="date"
              className="field py-1.5 text-xs"
              value={value.to}
              min={value.from}
              max={todayKey()}
              onChange={(e) =>
                onChange({
                  preset: "custom",
                  from: value.from || daysAgoKey(7),
                  to: e.target.value,
                })
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}
