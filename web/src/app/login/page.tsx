"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("agent@atrium.demo");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: err } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message || "Login failed");
      return;
    }
    router.push("/app/leads");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="animate-rise w-full max-w-md rounded-2xl border border-line bg-paper p-8 shadow-[0_24px_60px_rgba(18,20,26,0.08)]">
        <div className="font-display mb-1 text-2xl font-bold tracking-tight">ATRIUM</div>
        <p className="mb-6 text-sm text-muted">
          Sign in to your brokerage workspace.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-muted">Email</label>
          <input
            className="rounded-xl border border-line bg-canvas px-3 py-2.5 outline-none focus:border-cove"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
          <label className="mt-1 text-xs font-semibold text-muted">Password</label>
          <input
            className="rounded-xl border border-line bg-canvas px-3 py-2.5 outline-none focus:border-cove"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-cove px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          No account?{" "}
          <Link href="/register" className="font-semibold text-cove">
            Create one
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-muted">
          Demo: agent@atrium.demo / demo1234
        </p>
      </div>
    </div>
  );
}
