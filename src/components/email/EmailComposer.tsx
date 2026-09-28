"use client";

import { useRef, useState } from "react";
import type { EmailSetupStatus } from "../../lib/types";
import { notifyMailChanged } from "../AppHeader";
import type { ComposerDefaults } from "./replyDefaults";

const PLACEHOLDERS = [
  { token: "{{first_name}}", label: "First name" },
  { token: "{{full_name}}", label: "Full name" },
  { token: "{{company}}", label: "Company" },
];

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60";

function parseAddresses(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((address) => address.trim())
    .filter(Boolean);
}

type EmailComposerProps = {
  investorId?: string | number | null;
  defaults: ComposerDefaults;
  setup: EmailSetupStatus | null;
  /** Called after a send attempt was recorded (ok=false when the mail server refused it). */
  onSent: (result: { ok: boolean }) => void;
  onCancel?: () => void;
  title?: string;
};

/** Write and send an email from the company's connected mailbox. */
export function EmailComposer({ investorId, defaults, setup, onSent, onCancel, title }: EmailComposerProps) {
  const [to, setTo] = useState(defaults.to.join(", "));
  const [cc, setCc] = useState((defaults.cc ?? []).join(", "));
  const [showCc, setShowCc] = useState((defaults.cc ?? []).length > 0);
  const [subject, setSubject] = useState(defaults.subject ?? "");
  const [body, setBody] = useState(defaults.body ?? "");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const notConfigured = setup !== null && !setup.smtpConfigured;

  function insertPlaceholder(token: string) {
    const textarea = bodyRef.current;
    if (!textarea) {
      setBody((previous) => previous + token);
      return;
    }
    const start = textarea.selectionStart ?? body.length;
    const end = textarea.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function handleSend(event?: React.FormEvent) {
    event?.preventDefault();
    if (isSending) return;
    setError(null);
    setIsSending(true);
    try {
      const response = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId: investorId ?? null,
          to: parseAddresses(to),
          cc: showCc ? parseAddresses(cc) : [],
          subject,
          body,
          replyToEmailId: defaults.replyToEmailId ?? null,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error ?? `Sending failed (status ${response.status})`);
        // A refused send is still recorded on the timeline as a failed email.
        if (response.status === 502) onSent({ ok: false });
        return;
      }
      notifyMailChanged();
      onSent({ ok: true });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form
      onSubmit={handleSend}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) handleSend();
      }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">{title ?? "New email"}</div>
        {setup?.fromAddress && (
          <div className="truncate text-xs text-slate-500">
            From: {setup.fromName ? `${setup.fromName} <${setup.fromAddress}>` : setup.fromAddress}
          </div>
        )}
      </div>

      {notConfigured && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          Your company&apos;s mailbox isn&apos;t connected yet. You can write the email now; sending will
          work once your admin connects the mailbox.
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-sm text-slate-500">To</span>
        <input
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="name@company.com, another@company.com"
          disabled={isSending}
          className={INPUT_CLASS}
        />
        {!showCc && (
          <button
            type="button"
            onClick={() => setShowCc(true)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            Cc
          </button>
        )}
      </div>

      {showCc && (
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-sm text-slate-500">Cc</span>
          <input
            value={cc}
            onChange={(event) => setCc(event.target.value)}
            placeholder="Optional"
            disabled={isSending}
            className={INPUT_CLASS}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-sm text-slate-500">Subject</span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={300}
          disabled={isSending}
          className={INPUT_CLASS}
        />
      </div>

      <textarea
        ref={bodyRef}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={9}
        placeholder={"Hi {{first_name}},\n\n…"}
        disabled={isSending}
        className={`${INPUT_CLASS} resize-y font-[inherit] leading-relaxed`}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-400">Insert:</span>
        {PLACEHOLDERS.map((placeholder) => (
          <button
            key={placeholder.token}
            type="button"
            onClick={() => insertPlaceholder(placeholder.token)}
            className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 hover:bg-slate-200"
            title={`Replaced with the investor's ${placeholder.label.toLowerCase()} when sent`}
          >
            {placeholder.token}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto hidden text-xs text-slate-400 sm:inline">⌘ + Enter to send</span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Discard
          </button>
        )}
        <button
          type="submit"
          disabled={isSending || notConfigured || !to.trim() || !subject.trim() || !body.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
          </svg>
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
