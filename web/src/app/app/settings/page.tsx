"use client";

import { useEffect, useState } from "react";
import { api, portalLabel, type OrgSettings } from "@/lib/api";

const ALL_PORTALS = ["BAYUT", "PROPERTY_FINDER", "DUBIZZLE", "SKYLOOV"] as const;

export default function SettingsPage() {
  const [form, setForm] = useState({
    name: "",
    currencyCode: "AED",
    currencyLabel: "AED",
    defaultCity: "",
    privacyUrl: "",
    licenseLabel: "Licence no.",
    licenseNumber: "",
    enabledPortals: [...ALL_PORTALS] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<OrgSettings>("/api/settings")
      .then((s) => {
        setForm({
          name: s.name,
          currencyCode: s.currencyCode,
          currencyLabel: s.currencyLabel,
          defaultCity: s.defaultCity || "",
          privacyUrl: s.privacyUrl || "",
          licenseLabel: s.licenseLabel || "Licence no.",
          licenseNumber: s.licenseNumber || "",
          enabledPortals: s.enabledPortals?.length
            ? s.enabledPortals
            : [...ALL_PORTALS],
        });
      })
      .catch((e) => {
        if (e instanceof Error && /session expired|unauthorized/i.test(e.message)) return;
        setError(e instanceof Error ? e.message : "Failed to load settings");
      });
  }, []);

  function togglePortal(portal: string) {
    setForm((f) => {
      const on = f.enabledPortals.includes(portal);
      if (on && f.enabledPortals.length === 1) return f;
      return {
        ...f,
        enabledPortals: on
          ? f.enabledPortals.filter((p) => p !== portal)
          : [...f.enabledPortals, portal],
      };
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const updated = await api<OrgSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setForm({
        name: updated.name,
        currencyCode: updated.currencyCode,
        currencyLabel: updated.currencyLabel,
        defaultCity: updated.defaultCity || "",
        privacyUrl: updated.privacyUrl || "",
        licenseLabel: updated.licenseLabel || "Licence no.",
        licenseNumber: updated.licenseNumber || "",
        enabledPortals: updated.enabledPortals,
      });
      setMsg("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
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
          Market labels for this brokerage. Currency and portals come from config, not
          hardcoded product DNA.
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

        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            Enabled portals
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_PORTALS.map((portal) => {
              const on = form.enabledPortals.includes(portal);
              return (
                <button
                  key={portal}
                  type="button"
                  onClick={() => togglePortal(portal)}
                  className={`rounded-[8px] border px-3 py-2 text-sm font-semibold transition ${
                    on
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line text-muted hover:border-accent/40"
                  }`}
                >
                  {portalLabel(portal)}
                </button>
              );
            })}
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

      <div className="rounded-[8px] border border-line bg-paper/70 px-4 py-3 text-sm text-muted">
        Messaging (WhatsApp) is deferred until a real Meta Cloud API connection. No mock
        inbox, Slack, or Discord in product.
      </div>
    </div>
  );
}
