"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { error: issue } = await authClient.signIn.email({ email, password });
      if (issue) {
        setError(issue.message || "Sign-in failed");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && /^\/app(?:[/?#]|$)/.test(next) && !next.includes("\\") ? next : "/app");
    } catch {
      setError("Could not connect to Atrium. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[var(--sidebar)] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(135deg, transparent 40%, rgba(26,95,122,0.55)), url(https://images.unsplash.com/photo-1512453979798-5ea833a61a49?w=1600&q=80)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative">
          <div className="font-display text-3xl font-bold tracking-[-0.04em]">Atrium</div>
        </div>
        <div className="relative max-w-sm">
          <p className="font-display text-4xl font-bold leading-[1.1] tracking-[-0.03em]">
            Listings, leads, and viewings in one desk.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center bg-canvas px-6 py-12">
        <div className="animate-rise w-full max-w-[380px]">
          <div className="mb-8 lg:hidden">
            <div className="font-display text-2xl font-bold tracking-[-0.04em]">Atrium</div>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.03em]">Sign in</h1>
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
            <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted" htmlFor="email">
              Email
            </label>
            <input
              className="field w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              id="email"
              autoComplete="username"
              type="email"
              required
            />
            <label className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted" htmlFor="password">
              Password
            </label>
            <input
              className="field w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              id="password"
              autoComplete="current-password"
              type="password"
              required
            />
            {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary mt-2 w-full">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-5 text-sm text-muted">
            Have an invite? Check your link, or{" "}
            <Link href="/register" className="font-semibold text-accent">
              learn how access works
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
