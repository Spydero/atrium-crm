"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: err } = await authClient.signUp.email({
      email,
      password,
      name,
    });
    if (err) {
      setLoading(false);
      setError(err.message || "Sign up failed");
      return;
    }
    try {
      if (orgName.trim()) {
        await api("/api/bootstrap/organization", {
          method: "POST",
          body: JSON.stringify({ name: orgName.trim() }),
        });
      }
      router.push("/app");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="animate-rise w-full max-w-md rounded-2xl border border-line bg-paper p-8 shadow-[0_24px_60px_rgba(18,20,26,0.08)]">
        <div className="font-display mb-1 text-2xl font-bold">ATRIUM</div>
        <p className="mb-6 text-sm text-muted">Create an agent account.</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            className="rounded-xl border border-line bg-canvas px-3 py-2.5"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="rounded-xl border border-line bg-canvas px-3 py-2.5"
            placeholder="Brokerage name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
          <input
            className="rounded-xl border border-line bg-canvas px-3 py-2.5"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="rounded-xl border border-line bg-canvas px-3 py-2.5"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-cove px-4 py-3 text-sm font-semibold text-white"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Prefer the seeded demo?{" "}
          <Link href="/login" className="font-semibold text-cove">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
