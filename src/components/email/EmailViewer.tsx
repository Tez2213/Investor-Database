"use client";

import { useEffect, useState } from "react";
import type { EmailMessage } from "../../lib/types";
import { formatDateTime } from "../../lib/format";
import { notifyMailChanged } from "../AppHeader";
import { EmailBody } from "./EmailBody";
import { InvestorChip } from "./InvestorChip";

type EmailViewerProps = {
  emailId: string;
  onClose: () => void;
  onReply?: (email: EmailMessage) => void;
};

export function EmailStatusBadge({ email }: { email: Pick<EmailMessage, "direction" | "status"> }) {
  if (email.status === "failed") {
    return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">Failed</span>;
  }
  if (email.direction === "inbound") {
    return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">Received</span>;
  }
  return <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">Sent</span>;
}

function MessageCard({
  email,
  expanded,
  onToggle,
}: {
  email: EmailMessage;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sender = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address;
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">{sender}</span>
            <EmailStatusBadge email={email} />
            {email.direction === "outbound" && email.opened_at && (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-200">
                Opened{email.open_count > 1 ? ` ${email.open_count}×` : ""}
              </span>
            )}
          </div>
          {expanded ? (
            <div className="mt-0.5 space-y-0.5 text-xs text-slate-500">
              <div>To: {email.to_addresses.join(", ") || "—"}</div>
              {email.cc_addresses.length > 0 && <div>Cc: {email.cc_addresses.join(", ")}</div>}
              {email.sent_by && email.direction === "outbound" && <div>Sent by {email.sent_by}</div>}
            </div>
          ) : (
            <div className="mt-0.5 truncate text-xs text-slate-500">{email.snippet}</div>
          )}
        </div>
        <span className="shrink-0 text-xs text-slate-400">{formatDateTime(email.occurred_at)}</span>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4">
          {email.error && (
            <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Not delivered: {email.error}</div>
          )}
          <EmailBody html={email.html_body} text={email.text_body} />
        </div>
      )}
    </div>
  );
}

/** Modal showing an email and the rest of its conversation. */
export function EmailViewer({ emailId, onClose, onReply }: EmailViewerProps) {
  const [email, setEmail] = useState<EmailMessage | null>(null);
  const [thread, setThread] = useState<EmailMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([emailId]));

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/emails/${emailId}`)
      .then(async (res) => {
        const result = await res.json().catch(() => null);
        if (!res.ok) throw new Error(result?.error ?? "Could not load the email");
        return result as { data: EmailMessage; thread: EmailMessage[] };
      })
      .then((result) => {
        if (cancelled) return;
        setEmail(result.data);
        setThread(result.thread.length > 0 ? result.thread : [result.data]);
        if (!result.data.is_read) notifyMailChanged();
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [emailId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const latest = thread[thread.length - 1] ?? email;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-[2px] sm:p-10" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-slate-50 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 rounded-t-2xl border-b border-slate-200 bg-white px-6 py-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{email?.subject || (error ? "Email" : "Loading…")}</div>
            {email?.investor_id && (
              <div className="mt-1.5">
                <InvestorChip id={email.investor_id} name={email.investor_name} />
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onReply && latest && (
              <button
                type="button"
                onClick={() => onReply(latest)}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Reply
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          {!error && !email && <div className="h-32 animate-pulse rounded-xl bg-slate-100" />}
          {thread.length > 1 && (
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Conversation · {thread.length} messages
            </div>
          )}
          {thread.map((message) => (
            <MessageCard
              key={message.id}
              email={message}
              expanded={expanded.has(message.id) || message.id === latest?.id}
              onToggle={() =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(message.id)) next.delete(message.id);
                  else next.add(message.id);
                  return next;
                })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
