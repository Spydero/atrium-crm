"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, ImageIcon, Paperclip, Send, X } from "lucide-react";

type ChatAttachment = { fileName: string; contentType: string; size: number };
type GetAttachment = (messageId: number) => Promise<Blob>;
const acceptedFiles = ".jpg,.jpeg,.png,.webp,.gif,.pdf,.docx,.xlsx,.pptx,.txt,.csv";
const maxAttachmentBytes = 10 * 1024 * 1024;

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type ChatMessage = {
  id: number;
  senderName: string;
  body: string;
  createdAt: string;
  mine: boolean;
  attachment?: ChatAttachment | null;
};
export type ChatPage = { messages: ChatMessage[]; nextBefore: number | null; nextAfter: number | null; organization?: string };
export type ChatRequest = <T>(suffix: string, init?: RequestInit) => Promise<T>;

function messageContent(text: string) {
  return text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part;
    return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="underline">{part}</a>;
  });
}

function MessageAttachment({ attachment, messageId, getAttachment }: {
  attachment: ChatAttachment;
  messageId: number;
  getAttachment: GetAttachment;
}) {
  const mounted = useRef(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isImage = attachment.contentType.startsWith("image/");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (previewUrl) return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function openFile(showPreview: boolean) {
    if (busy) return;
    if (showPreview && previewUrl) {
      setError("");
      setPreviewUrl("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const file = await getAttachment(messageId);
      if (!mounted.current) return;
      if (showPreview) {
        setPreviewUrl(URL.createObjectURL(file));
        return;
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the attachment.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2 rounded-lg border border-line bg-white/70 p-2">
      <div className="flex items-start gap-2">
        {isImage ? <ImageIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <FileText size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
        <div className="min-w-0">
          <p className="text-sm font-medium [overflow-wrap:anywhere]">{attachment.fileName}</p>
          <p className="text-xs text-muted">{fileSize(attachment.size)}</p>
        </div>
      </div>
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- Private attachment bytes use a temporary browser URL.
        <img src={previewUrl} alt={attachment.fileName} className="max-h-64 max-w-full rounded object-contain"
          onError={() => setError("This image could not be previewed. You can download it instead.")} />
      )}
      <div className="flex flex-wrap gap-1">
        {isImage && <button type="button" className="btn-ghost" disabled={busy} onClick={() => void openFile(true)}>{previewUrl ? "Hide preview" : "Preview image"}</button>}
        <button type="button" className="btn-ghost gap-1" aria-label={`Download ${attachment.fileName}`} disabled={busy} onClick={() => void openFile(false)}>
          <Download size={14} aria-hidden="true" /> {busy ? "Loading…" : "Download"}
        </button>
      </div>
      {error && <p role="status" className="text-xs text-muted">{error}</p>}
    </div>
  );
}

export function ChatThread({ request, getAttachment, disabled, onPage }: {
  request: ChatRequest;
  getAttachment: GetAttachment;
  disabled?: boolean;
  onPage?: (page: ChatPage) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const draftId = useRef<string | null>(null);
  const marked = useRef(0);
  const initialized = useRef(false);
  const receivedThrough = useRef<number | null>(null);
  const follow = useRef(true);
  const restore = useRef<{ height: number; top: number } | null>(null);

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages(current => {
      const byId = new Map(current.map(message => [message.id, message]));
      for (const message of incoming) byId.set(message.id, message);
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let running = false;
    const refresh = async () => {
      if (disposed || running || document.visibilityState !== "visible") return;
      running = true;
      try {
        let cursor = receivedThrough.current;
        let more: boolean;
        do {
          const page: ChatPage = await request<ChatPage>(cursor ? `?after=${cursor}` : "");
          if (disposed) return;
          if (!initialized.current) {
            initialized.current = true;
            setBefore(page.nextBefore);
          }
          mergeMessages(page.messages);
          onPage?.(page);
          receivedThrough.current = page.messages.at(-1)?.id ?? cursor;
          cursor = page.nextAfter;
          more = Boolean(cursor);
        } while (more);
        setError("");
        setLoading(false);
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : "Could not load messages.");
          setLoading(false);
        }
      } finally { running = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 4000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [request, mergeMessages, onPage]);

  useEffect(() => {
    const pane = scroller.current;
    if (!pane) return;
    if (restore.current) {
      pane.scrollTop = restore.current.top + pane.scrollHeight - restore.current.height;
      restore.current = null;
    } else if (follow.current) pane.scrollTop = pane.scrollHeight;
  }, [messages]);

  const latestId = messages.at(-1)?.id;
  const markLatest = useCallback(async () => {
    if (!latestId || latestId <= marked.current || !follow.current || document.visibilityState !== "visible") return;
    marked.current = latestId;
    try {
      await request("/read", { method: "POST", body: JSON.stringify({ lastMessageId: latestId }) });
    } catch { if (marked.current === latestId) marked.current = 0; }
  }, [latestId, request]);

  useEffect(() => {
    void markLatest();
    const timer = window.setInterval(markLatest, 5000);
    return () => window.clearInterval(timer);
  }, [markLatest]);

  async function loadOlder() {
    if (!before || older) return;
    setOlder(true);
    try {
      const page = await request<ChatPage>(`?before=${before}`);
      const pane = scroller.current;
      if (pane) restore.current = { height: pane.scrollHeight, top: pane.scrollTop };
      mergeMessages(page.messages);
      setBefore(page.nextBefore);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not load older messages.");
    } finally { setOlder(false); }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (sending || disabled || (!body.trim() && !file)) return;
    setSending(true);
    setNotice("");
    draftId.current ??= crypto.randomUUID();
    try {
      const payload = { body, requestId: draftId.current };
      let requestBody: FormData | string = JSON.stringify(payload);
      if (file) {
        const form = new FormData();
        form.set("body", body);
        form.set("requestId", payload.requestId);
        form.set("attachment", file);
        requestBody = form;
      }
      const message = await request<ChatMessage>("/send", { method: "POST", body: requestBody });
      follow.current = true;
      mergeMessages([message]);
      setBody("");
      setFile(null);
      draftId.current = null;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Message could not be sent. Try again.");
    } finally { setSending(false); }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-48 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-label="Conversation messages"
        onScroll={event => {
          const pane = event.currentTarget;
          follow.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 55;
          if (follow.current) void markLatest();
        }}>
        {before && <button className="btn-ghost mx-auto block" onClick={loadOlder} disabled={older}>{older ? "Loading…" : "Load older messages"}</button>}
        {loading && <p className="text-sm text-muted">Loading messages…</p>}
        {!loading && !messages.length && !error && <p className="text-sm text-muted">No messages yet.</p>}
        {messages.map(message => (
          <div key={message.id} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-xl px-3 py-2 sm:max-w-[75%] ${message.mine ? "bg-accent-soft" : "border border-line bg-white"}`}>
              <div className="mb-1 flex flex-wrap gap-x-2 text-xs text-muted">
                <span className="font-semibold text-ink">{message.mine ? "You" : message.senderName}</span>
                <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
                  {new Date(message.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </time>
              </div>
              {message.body && <p className="mb-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{messageContent(message.body)}</p>}
              {message.attachment && <MessageAttachment attachment={message.attachment} messageId={message.id} getAttachment={getAttachment} />}
            </div>
          </div>
        ))}
      </div>
      {(error || notice) && <p role="status" className="border-t border-line px-4 py-2 text-sm text-muted">{notice || error}</p>}
      {disabled ? <p className="border-t border-line p-4 text-sm text-muted">Messaging is paused for this conversation.</p> : (
        <form className="space-y-2 border-t border-line p-3" onSubmit={send}>
          {file && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Paperclip size={14} aria-hidden="true" />
              <span className="min-w-0 truncate">{file.name} · {fileSize(file.size)}</span>
              <button type="button" className="btn-ghost" aria-label="Remove attachment" disabled={sending}
                onClick={() => { setFile(null); draftId.current = null; }}><X size={14} /></button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={picker} className="hidden" type="file" accept={acceptedFiles} aria-label="Attachment file"
              disabled={sending} onChange={event => {
                const selected = event.target.files?.[0];
                event.target.value = "";
                if (!selected) return;
                if (selected.size < 1 || selected.size > maxAttachmentBytes) {
                  setNotice("Choose a file between 1 byte and 10 MB.");
                  return;
                }
                setNotice("");
                setFile(selected);
                draftId.current = null;
              }} />
            <button type="button" className="btn-ghost" aria-label="Attach a file" title="Attach a photo or document up to 10 MB"
              disabled={sending} onClick={() => picker.current?.click()}><Paperclip size={17} /></button>
            <textarea className="field min-h-12 flex-1 resize-y" rows={2} aria-label="Message" placeholder="Write a message…" maxLength={4000} value={body}
              disabled={sending} onChange={event => { setBody(event.target.value); draftId.current = null; }} />
            <button type="submit" className="btn-primary gap-2" disabled={sending || (!body.trim() && !file)}>
              <Send size={16} aria-hidden="true" /> {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
