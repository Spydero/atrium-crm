"use client";

import Link from "next/link";

/** Public self-signup is closed. Accounts are invite-only via Atrium Ops. */
export default function RegisterClosedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="animate-rise w-full max-w-[420px] surface p-7">
        <div className="font-display text-xl font-bold tracking-[-0.03em]">Atrium</div>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-[-0.03em]">Invite only</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This is the brokerage CRM. Access is invite-only. Use the invite link you were sent, then
          sign in here. There is no self-serve signup.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/login" className="btn-primary inline-flex justify-center text-center">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
