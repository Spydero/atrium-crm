"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ErrorNote } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setError(error.message || "Sign-in failed");
      setBusy(false);
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm">
      <h2 className="font-display text-2xl font-bold tracking-tight">Operator sign-in</h2>
      <p className="mt-1 mb-7 text-sm text-muted">
        Use your platform account. Brokerage logins won&apos;t work here.
      </p>
      <ErrorNote message={error} />
      <label className="label" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="username"
        className="field mb-4"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="label" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        required
        autoComplete="current-password"
        className="field mb-6"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex flex-col justify-between bg-[var(--sidebar)] px-10 py-10 text-white lg:px-16 lg:py-14">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[var(--sidebar-muted)]">
          Atrium · Platform
        </span>
        <div className="py-16">
          <h1 className="font-display text-6xl font-bold leading-[0.95] tracking-tight lg:text-7xl">
            Atrium
            <br />
            <span className="text-[#5fb3c6]">Ops</span>
          </h1>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-[var(--sidebar-muted)]">
            Platform console only. Create brokerages and invite their first owner.
            Brokers work in the CRM, not here.
          </p>
        </div>
        <span className="text-xs text-[var(--sidebar-muted)]">
          Atrium operators only - not for brokerage staff.
        </span>
      </section>
      <section className="flex items-center justify-center bg-canvas px-6 py-12">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </section>
    </div>
  );
}
