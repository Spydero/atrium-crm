"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createOrganization } from "@/lib/api";
import { ErrorNote, PageHeader } from "@/components/ui";

const CURRENCIES = ["AED", "USD", "GBP", "EUR", "INR", "SAR", "QAR", "SGD"];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function NewOrganizationPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const { id } = await createOrganization({
        name: s("name"),
        slug: s("slug") || undefined,
        currencyCode: s("currencyCode"),
        defaultCity: s("defaultCity"),
        owner: { name: s("ownerName"), email: s("ownerEmail"), role: "owner" },
      });
      router.push(`/organizations/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New organization"
        subtitle="Create the brokerage and invite its first owner."
      />
      <ErrorNote message={error} />
      <form onSubmit={onSubmit} className="surface max-w-2xl divide-y divide-line">
        <section className="grid gap-4 p-6 sm:grid-cols-2">
          <h2 className="font-display text-sm font-bold sm:col-span-2">Organization</h2>
          <Field label="Name">
            <input name="name" required className="field" placeholder="Harbour Realty" />
          </Field>
          <Field label="Slug (optional)" hint="Generated from the name if blank.">
            <input
              name="slug"
              className="field font-mono"
              pattern="[a-z0-9\-]*"
              placeholder="harbour-realty"
            />
          </Field>
          <Field label="Currency">
            <select name="currencyCode" className="field" defaultValue="AED">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Default city">
            <input name="defaultCity" required className="field" placeholder="Dubai" />
          </Field>
        </section>

        <section className="grid gap-4 p-6 sm:grid-cols-2">
          <h2 className="font-display text-sm font-bold sm:col-span-2">First owner</h2>
          <Field label="Name">
            <input name="ownerName" required className="field" />
          </Field>
          <Field label="Email">
            <input name="ownerEmail" type="email" required className="field" />
          </Field>
          <Field label="Role">
            <input value="owner" readOnly className="field cursor-not-allowed text-muted" />
          </Field>
        </section>

        <div className="flex items-center justify-end gap-2 p-4">
          <Link href="/organizations" className="btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create organization"}
          </button>
        </div>
      </form>
    </>
  );
}
