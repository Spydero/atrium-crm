"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AppShell } from "@/components/AppShell";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (!data?.session) {
        router.replace("/login");
        return;
      }
      setName(data.user.name);
      setReady(true);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading workspace…
      </div>
    );
  }

  return <AppShell userName={name}>{children}</AppShell>;
}
