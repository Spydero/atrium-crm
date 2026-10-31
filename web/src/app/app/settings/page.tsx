"use client";

import { useEffect, useState } from "react";
import { api, type OrgChannel, type OrgSettings } from "@/lib/api";

export default function SettingsPage() {
  const [form, setForm] = useState({
    name: "",
    currencyCode: "AED",
    currencyLabel: "AED",
    defaultCity: "",
    privacyUrl: "",
    licenseLabel: "Licence no.",
    licenseNumber: "",
  });
  const [channels, setChannels] = useState<OrgChannel[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<"PORTAL" | "ADS" | "OTHER">("OTHER");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const s = await api<OrgSettings>("/api/settings");
    setForm({
      name: s.name,
      currencyCode: s.currencyCode,
      currencyLabel: s.currencyLabel,
      defaultCity: s.defaultCity || "",
      privacyUrl: s.privacyUrl || "",
      licenseLabel: s.licenseLabel || "Licence no.",
      licenseNumber: s.licenseNumber || "",
    });
    setChannels(s.channels || []);
  }

  useEffect(() => {
    load().catch((e) => {
      if (e instanceof Error && /session expired|unauthorized/i.test(e.message)) return;
      setError(e instanceof Error ? e.message : "Failed to load settings");
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setError("");
    try {
      await api<OrgSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setMsg("Settings saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleChannel(ch: OrgChannel) {
    setError("");
    try {
      await api(`/api/settings/channels/${ch.key}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !ch.enabled }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update channel");
    }
  }

  async function renameChannel(ch: OrgChannel, label: string) {
    const next = label.trim();
    if (!next || next === ch.label) return;
    try {
      await api(`/api/settings/channels/${ch.key}`, {
        method: "PATCH",
        body: JSON.stringify({ label: next }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename channel");
    }
  }

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setError("");
    try {
      await api("/api/settings/channels", {
        method: "POST",
        body: JSON.stringify({ label: newLabel.trim(), kind: newKind }),
      });
      setNewLabel("");
      await load();
      setMsg("Channel added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add channel");
    }
  }

  async function removeChannel(ch: OrgChannel) {
    if (ch.kind === "SYSTEM") return;
    setError("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/settings/channels/${ch.key}`,
        { method: "DELETE", credentials: "include" },
      );
      if (res.status === 204) {
        await load();
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (body.disabled) {
        setMsg(`"${ch.label}" has history, so it was disabled instead of deleted.`);
        await load();
        return;
      }
      throw new Error(body.error || "Delete failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove channel");
    }
  }

  return (
    <div className="animate-rise mx-auto max-w-2xl space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
          Admin
        </div>
        <h1 className="font-display mt-1 text-3xl font-bold tracking-[-0.03em]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted">
          Market labels and channels for this brokerage. Channel names are yours - not hardcoded
          product DNA.
        </p>
      </div>

      <form onSubmit={save} className="surface space-y-4 p-5">
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            Brokerage name
          </span>
          <input
            className="field w-full"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
              Currency code
            </span>
            <input
              className="field w-full"
              value={form.currencyCode}
              onChange={(e) =>
                setForm({ ...form, currencyCode: e.target.value.toUpperCase() })
              }
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
              Currency label
            </span>
            <input
              className="field w-full"
              value={form.currencyLabel}
              onChange={(e) => setForm({ ...form, currencyLabel: e.target.value })}
              required
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            Default city hint
          </span>
          <input
            className="field w-full"
            value={form.defaultCity}
            onChange={(e) => setForm({ ...form, defaultCity: e.target.value })}
            placeholder="Used as a soft default on new listings"
          />
        </label>

        <div className="border-t border-line pt-4">
          <div className="mb-3">
            <div className="text-sm font-bold">Public pages and guides</div>
            <p className="text-xs text-muted">
              Shown on public guide pages and printed on guides you generate. Leave blank if not
              required in your market.
            </p>
          </div>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                Privacy notice link
              </span>
              <input
                className="field w-full"
                type="url"
                value={form.privacyUrl}
                onChange={(e) => setForm({ ...form, privacyUrl: e.target.value })}
                placeholder="https://yourbrokerage.com/privacy"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Licence label
                </span>
                <input
                  className="field w-full"
                  value={form.licenseLabel}
                  onChange={(e) => setForm({ ...form, licenseLabel: e.target.value })}
                  placeholder="e.g. Licence no., ORN, Registration"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Licence or registration number
                </span>
                <input
                  className="field w-full"
                  value={form.licenseNumber}
                  onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                />
              </label>
            </div>
          </div>
        </div>

        {msg && (
          <p className="rounded-[8px] border border-accent/20 bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
            {msg}
          </p>
        )}
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>

      <div className="surface space-y-4 p-5" data-testid="channels-settings">
        <div>
          <div className="text-sm font-bold">Channels</div>
          <p className="mt-1 text-xs text-muted">
            Where leads come from and which portals you track publish status for. Spend on Money Map
            is typed in by your team - not pulled from live ad or portal APIs.
          </p>
        </div>

        <ul className="space-y-2">
          {channels.map((ch) => (
            <li
              key={ch.key}
              className="flex flex-wrap items-center gap-2 rounded-[8px] border border-line px-3 py-2"
            >
              <button
                type="button"
                aria-pressed={ch.enabled}
                onClick={() => toggleChannel(ch)}
                className={`rounded-[6px] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                  ch.enabled ? "bg-accent-soft text-accent" : "bg-[#eef1f4] text-muted"
                }`}
              >
                {ch.enabled ? "On" : "Off"}
              </button>
              <input
                className="field min-w-[140px] flex-1 py-1.5 text-sm"
                defaultValue={ch.label}
                key={`${ch.key}-${ch.label}`}
                onBlur={(e) => renameChannel(ch, e.target.value)}
                aria-label={`Label for ${ch.key}`}
              />
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                {ch.kind.toLowerCase()}
              </span>
              <span className="font-mono text-[11px] text-muted">{ch.key}</span>
              {ch.kind !== "SYSTEM" && (
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--danger)]"
                  onClick={() => removeChannel(ch)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={addChannel} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <label className="block min-w-[160px] flex-1 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
              Add channel
            </span>
            <input
              className="field w-full"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Google Ads, Local classifieds"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Kind</span>
            <select
              className="field"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as "PORTAL" | "ADS" | "OTHER")}
            >
              <option value="OTHER">Other</option>
              <option value="PORTAL">Portal</option>
              <option value="ADS">Ads</option>
            </select>
          </label>
          <button type="submit" className="btn-ghost text-sm" disabled={!newLabel.trim()}>
            Add
          </button>
        </form>
      </div>

      <div className="rounded-[8px] border border-line bg-paper/70 px-4 py-3 text-sm text-muted">
        Live Bayut / Meta / WhatsApp APIs are not connected. Messaging stays deferred until a real
        Meta Cloud API connection. No mock inbox.
      </div>
    </div>
  );
}
