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
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="animate-rise w-full max-w-[400px] surface p-7">
        <div className="font-display text-xl font-bold tracking-[-0.03em]">Atrium</div>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-[-0.03em]">
          Create account
        </h1>
        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
          <input
            className="field"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="field"
            placeholder="Brokerage name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
          <input
            className="field"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="field"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary mt-1">
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          Have an account?{" "}
          <Link href="/login" className="font-semibold text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
