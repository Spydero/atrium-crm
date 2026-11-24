"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { API_BASE, ApiError } from "@/lib/api";
import { ChatThread, type ChatPage } from "@/components/ChatThread";

export default function ClientChatPage() {
  const { id } = useParams<{ id: string }>();
  return <ClientChat key={id} id={id} />;
}

function ClientChat({ id }: { id: string }) {
  const key = `atrium-chat:${id}`;
  const endpoint = `${API_BASE}/api/client-chat/${encodeURIComponent(id)}`;
  const [session, setSession] = useState("");
  const activeSession = useRef("");
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState("");
  const [invite, setInvite] = useState("");
  const [organization, setOrganization] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const updateSession = useCallback((token: string) => {
    activeSession.current = token;
    setSession(token);
    try {
      if (token) sessionStorage.setItem(key, token);
      else sessionStorage.removeItem(key);
    } catch {
      // The current tab can still use the session when storage is disabled.
    }
  }, [key]);

  useEffect(() => {
    function captureInvite() {
      const fragment = window.location.hash.slice(1);
      if (!fragment) return;
      setInvite(fragment);
      setPinRequired(false);
      setPin("");
      setError("");
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      captureInvite();
      try {
        const saved = sessionStorage.getItem(key) ?? "";
        activeSession.current = saved;
        setSession(saved);
      } catch {
        // Storage can be disabled. The active tab can still hold its session in memory.
      }
      setReady(true);
    });
    window.addEventListener("hashchange", captureInvite);
    return () => {
      active = false;
      window.removeEventListener("hashchange", captureInvite);
    };
  }, [key]);

  const requestResponse = useCallback(async (suffix: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (session) headers.set("Authorization", `Bearer ${session}`);
    const response = await fetch(`${endpoint}${suffix}`, { ...init, headers, cache: "no-store" });
    if (response.status === 401 && session && session === activeSession.current && suffix !== "/session") {
      updateSession("");
      setError("Your session has ended. Ask your broker for a new chat link.");
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (suffix === "/session" && response.status === 403 && data.code === "PIN_REQUIRED") {
        setPinRequired(true);
      }
      const message = suffix === "/session" && response.status === 429
        ? "Too many sign-in attempts. Wait a few minutes and try this link again."
        : data.error || "The request couldn’t be completed. Please try again.";
      throw new ApiError(message, response.status);
    }
    return response;
  }, [endpoint, session, updateSession]);

  const request = useCallback(async <T,>(suffix: string, init?: RequestInit): Promise<T> => {
    const response = await requestResponse(suffix, init);
    if (response.status === 204 || response.status === 202) return undefined as T;
    return response.json();
  }, [requestResponse]);

  const getAttachment = useCallback(async (messageId: number) =>
    (await requestResponse(`/attachments/${messageId}`)).blob(), [requestResponse]);

  const onPage = useCallback((page: ChatPage) => setOrganization(page.organization ?? ""), []);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await request<{ token: string }>("/session", { method: "POST", body: JSON.stringify({ token: invite, ...(pinRequired ? { pin } : {}) }) });
      updateSession(data.token);
      setInvite("");
      setPin("");
      setPinRequired(false);
    } catch (e) {
      if (e instanceof ApiError && [400, 401].includes(e.status)) {
        setInvite("");
        setPinRequired(false);
      }
      setPin("");
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-2xl px-3 py-5 sm:px-6 sm:py-10">
      <div className="surface overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-3"><MessageSquare size={20} />
            <div>
              <h1 className="font-display text-xl font-bold">{session && organization ? organization : "Atrium client chat"}</h1>
              {session && <p className="text-xs text-muted">Private conversation</p>}
            </div>
          </div>
          {session && <button className="btn-ghost" onClick={() => {
            void request("/session", { method: "DELETE" }).catch(() => {});
            updateSession("");
            setOrganization("");
            setError("");
          }}>Sign out</button>}
        </header>
        {ready && (session && !invite ? (
          <div className="flex h-[75dvh] flex-col"><ChatThread key={id} request={request} getAttachment={getAttachment} onPage={onPage} /></div>
        ) : invite ? (
          <form className="space-y-3 p-5" onSubmit={signIn}>
            {pinRequired ? (
              <label className="block text-sm font-medium">
                Chat PIN
                <input className="field mt-1 block w-40" type="password" inputMode="numeric" autoComplete="off"
                  value={pin} onChange={event => setPin(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  required minLength={6} maxLength={6} disabled={busy} />
              </label>
            ) : <p className="text-sm text-muted">Continue to open your private conversation.</p>}
            <button type="submit" className="btn-primary" disabled={busy || (pinRequired && pin.length !== 6)}>
              {busy ? "Signing in…" : "Open private chat"}
            </button>
          </form>
        ) : (
          <p className="p-5 text-sm text-muted">Open the private chat link your broker shared. Ask your broker for a new link if you need one.</p>
        ))}
        {error && <p className="px-5 pb-5 text-sm text-muted" role="status">{error}</p>}
      </div>
    </main>
  );
}
