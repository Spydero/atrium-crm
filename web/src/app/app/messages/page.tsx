"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, MessageSquare, Users } from "lucide-react";
import { api, apiResponse } from "@/lib/api";
import { ChatThread, type ChatMessage } from "@/components/ChatThread";

type Kind = "team" | "client";
type Conversation = {
  id: string;
  kind: Kind;
  title: string;
  leadId?: string;
  accessEnabled: boolean;
  canSend: boolean;
  unread: number;
  latest: ChatMessage | null;
};
type ShareLink = { id: string; url: string; expiresAt: string | null; pin: string | null };
type Teammate = { id: string; name: string };

export default function MessagesPage() {
  const [tab, setTab] = useState<Kind>("team");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [selected, setSelected] = useState("");
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [requirePin, setRequirePin] = useState(false);
  const [expiry, setExpiry] = useState("7");
  const [customDays, setCustomDays] = useState("14");
  const [teammateId, setTeammateId] = useState("");
  const [lead, setLead] = useState<{ id: string; name: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setConversations(await api<Conversation[]>("/api/messages"));
    setRefreshError("");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("lead");
    if (params.get("tab") === "client" || id) setTab("client");
    if (id) {
      api<{ id: string; name: string }>(`/api/messages/lead/${encodeURIComponent(id)}`)
        .then(setLead)
        .catch(e => setError(e.message));
    }

    let running = false;
    const poll = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try { await refresh(); }
      catch { setRefreshError("Could not refresh conversations. Reconnecting…"); }
      finally { running = false; }
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh]);

  const active = conversations.find(row => row.id === selected && row.kind === tab)
    ?? (!selected && tab === "client" ? conversations.find(row => row.leadId === lead?.id) : undefined);

  const activeId = active?.id;
  const request = useCallback(<T,>(suffix: string, init?: RequestInit) =>
    api<T>(`/api/messages/${activeId}${suffix}`, init), [activeId]);

  const getAttachment = useCallback(async (messageId: number) =>
    (await apiResponse(`/api/messages/${activeId}/attachments/${messageId}`, { cache: "no-store" })).blob(), [activeId]);

  function selectTab(kind: Kind) {
    if (busy) return;
    setShareLink(null);
    setRequirePin(false);
    setExpiry("7");
    setCustomDays("14");
    setTab(kind);
    setSelected("");
    setLead(null);
    setError("");
    setNotice("");
    setShowConfirm(false);
  }

  async function openTeamPicker() {
    setShowConfirm(false);
    setError("");
    try { setTeammates(await api<Teammate[]>("/api/messages/teammates")); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load teammates."); }
    finally { setShowConfirm(true); }
  }

  async function startDM(event: React.FormEvent) {
    event.preventDefault();
    if (!teammateId || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("/api/messages/team", { method: "POST", body: JSON.stringify({ teammateId }) });
      await refresh();
      setSelected(result.id);
      setShowConfirm(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start this DM."); }
    finally { setBusy(false); }
  }

  async function createChatLink(event: React.FormEvent<HTMLFormElement>, leadId: string) {
    event.preventDefault();
    if (busy) return;
    const expiryDays = expiry === "never" ? null : Number(expiry === "custom" ? customDays : expiry);
    setBusy(true);
    setError("");
    setNotice("");
    setShareLink(null);
    try {
      const result = await api<ShareLink>("/api/messages/client", {
        method: "POST", body: JSON.stringify({ leadId, expiryDays, requirePin }),
      });
      setSelected(result.id);
      setShareLink(result);
      await refresh();
      setLead(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the chat link.");
    } finally { setBusy(false); }
  }

  async function copyInviteValue(value: string, label: "Chat link" | "PIN") {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(`Select and copy the ${label.toLowerCase()} below.`);
    }
  }

  async function revoke() {
    if (!active || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/messages/${active.id}/revoke`, { method: "POST" });
      setShareLink(null);
      await refresh();
      setNotice("Client access revoked.");
      setShowConfirm(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not revoke access."); }
    finally { setBusy(false); }
  }

  const unread = (kind: Kind) => conversations.filter(row => row.kind === kind).reduce((sum, row) => sum + row.unread, 0);
  const rows = conversations.filter(row => row.kind === tab);
  const inviteTarget = active?.leadId ? { id: active.leadId, name: active.title } : lead;
  const visibleLink = active?.id === shareLink?.id ? shareLink : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">Messages</h1>
        {tab === "team" && <button className="btn-primary gap-2" onClick={openTeamPicker}><MessageSquare size={15} /> New DM</button>}
        {tab === "client" && <Link href="/app/leads" className="btn-ghost">Find a lead</Link>}
      </div>
      <div className="flex gap-2" aria-label="Message categories">
        {(["team", "client"] as const).map(kind => (
          <button type="button" key={kind} aria-pressed={tab === kind} className={tab === kind ? "btn-primary gap-2" : "btn-ghost gap-2"} onClick={() => selectTab(kind)}>
            {kind === "team" ? <Users size={16} /> : <Link2 size={16} />}
            {kind === "team" ? "Team" : "Clients"} {unread(kind) > 0 && <span aria-label={`${unread(kind)} unread`}>· {unread(kind)}</span>}
          </button>
        ))}
      </div>
      {tab === "team" && showConfirm && (
        <form className="surface flex flex-wrap items-end gap-3 p-3" onSubmit={startDM}>
          <label className="min-w-48 flex-1 text-sm font-semibold">Teammate
            <select className="field mt-1 w-full" value={teammateId} onChange={event => setTeammateId(event.target.value)}>
              <option value="">{teammates.length ? "Choose teammate" : "No active teammates"}</option>
              {teammates.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <button className="btn-primary" disabled={busy || !teammateId}>Open DM</button>
          <button type="button" className="btn-ghost" onClick={() => setShowConfirm(false)}>Cancel</button>
        </form>
      )}
      {(error || refreshError || notice) && <p role="status" className="text-sm text-muted">{error || refreshError || notice}</p>}
      <div className="surface grid min-h-[65vh] overflow-hidden md:grid-cols-[minmax(200px,285px)_minmax(0,1fr)]">
        <aside className="max-h-56 overflow-auto border-b border-line md:max-h-[70vh] md:border-r md:border-b-0" aria-label="Conversations">
          {!rows.length && <p className="p-4 text-sm text-muted">{tab === "team" ? "Start a DM to message a teammate." : "Open an assigned lead to invite a client."}</p>}
          {rows.map(row => (
            <button type="button" key={row.id} aria-current={active?.id === row.id ? "true" : undefined}
              className={`block w-full border-b border-line px-4 py-3 text-left hover:bg-accent-soft ${active?.id === row.id ? "bg-accent-soft" : ""}`}
              disabled={busy}
              onClick={() => { setShareLink(null); setRequirePin(false); setExpiry("7"); setCustomDays("14"); setSelected(row.id); setLead(null); setShowConfirm(false); setNotice(""); setError(""); }}>
              <span className="flex items-center justify-between gap-2 font-semibold">
                <span className="truncate">{row.title}</span>
                {row.unread > 0 && <span className="rounded-full bg-accent px-2 text-xs text-white" aria-label={`${row.unread} unread`}>{row.unread}</span>}
              </span>
              <span className="block truncate text-sm text-muted">{row.latest?.body || row.latest?.attachment?.fileName || "No messages yet"}</span>
            </button>
          ))}
        </aside>
        <div className="flex h-[65vh] min-w-0 flex-col">
          {inviteTarget && tab === "client" && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <div className="font-semibold">{inviteTarget.name}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link className="btn-ghost" href={`/app/leads?lead=${encodeURIComponent(inviteTarget.id)}`}>Open lead</Link>

                {active?.accessEnabled && <button type="button" className="btn-ghost" disabled={busy} onClick={revoke}>Revoke access</button>}
              </div>
            </div>
          )}
          {inviteTarget && tab === "client" && (
            <form className="space-y-2 border-b border-line px-4 py-3" onSubmit={event => void createChatLink(event, inviteTarget.id)}>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm font-medium">
                  Link expiry
                  <select className="field mt-1 block" value={expiry} disabled={busy} onChange={event => setExpiry(event.target.value)}>
                    <option value="1">1 day</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="custom">Custom</option>
                    <option value="never">No expiry</option>
                  </select>
                </label>
                {expiry === "custom" && (
                  <label className="text-sm font-medium">
                    Days (1–30)
                    <input className="field mt-1 block w-28" type="number" min={1} max={30} step={1}
                      required disabled={busy} value={customDays} onChange={event => setCustomDays(event.target.value)} />
                  </label>
                )}
                <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={requirePin} disabled={busy} onChange={event => setRequirePin(event.target.checked)} />
                  Require PIN
                </label>
                <button type="submit" className="btn-ghost" disabled={busy}>
                  {active?.accessEnabled ? "Create new chat link" : "Create chat link"}
                </button>
              </div>
              {requirePin && (
                <p className="text-xs text-muted">The client needs both the link and a six-digit PIN. Share the PIN separately.</p>
              )}
              {expiry === "never" && (
                <p className="text-xs text-muted">The link stays valid until it’s used, replaced, or revoked.</p>
              )}
            </form>
          )}
          {visibleLink && (
            <div className="space-y-2 border-b border-line px-4 py-3">
              <p className="text-sm text-muted">
                Share privately with your client. {visibleLink.expiresAt
                  ? `The link works once and expires ${new Date(visibleLink.expiresAt).toLocaleString()}.`
                  : "The link works once and has no expiry date."}
              </p>
              <div className="flex flex-wrap gap-2">
                <input className="field min-w-0 flex-1" readOnly aria-label="Private chat link"
                  value={visibleLink.url} onFocus={event => event.currentTarget.select()} />
                <button type="button" className="btn-primary gap-2" onClick={() => void copyInviteValue(visibleLink.url, "Chat link")}>
                  <Copy size={15} /> Copy link
                </button>
              </div>
              {visibleLink.pin && (
                <div className="space-y-2">
                  <p className="text-sm text-muted">Give the PIN to your client separately, ideally over a call.</p>
                  <div className="flex flex-wrap gap-2">
                    <input className="field w-28 font-mono" readOnly aria-label="Private chat PIN"
                      value={visibleLink.pin} onFocus={event => event.currentTarget.select()} />
                    <button type="button" className="btn-ghost gap-2" onClick={() => void copyInviteValue(visibleLink.pin!, "PIN")}>
                      <Copy size={15} /> Copy PIN
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {active ? (
            <>
              {active.kind === "team" && <h2 className="border-b border-line px-4 py-3 font-semibold">{active.title}</h2>}
              <ChatThread key={active.id} request={request} getAttachment={getAttachment} disabled={!active.canSend} />
            </>
          ) : !inviteTarget && <p className="m-auto p-4 text-sm text-muted">Select a conversation to read or send messages.</p>}
        </div>
      </div>
    </div>
  );
}
