"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EmailMessage, EmailSetupStatus, EmailSummary } from "../../lib/types";
import { companyName } from "../../lib/companies";
import { formatShortDate } from "../../lib/format";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { AppHeader, notifyMailChanged } from "../AppHeader";
import { useSession } from "../SessionProvider";
import { EmailComposer } from "../email/EmailComposer";
import { EmailSetupNotice } from "../email/EmailSetupNotice";
import { EmailStatusBadge, EmailViewer } from "../email/EmailViewer";
import { InvestorChip } from "../email/InvestorChip";
import { buildReplyDefaults, type ComposerDefaults } from "../email/replyDefaults";
import { EmailStatsBar } from "./EmailStatsBar";

const FOLDERS = [
  { id: "inbox", label: "Inbox" },
  { id: "unread", label: "Unread" },
  { id: "sent", label: "Sent" },
  { id: "failed", label: "Failed" },
  { id: "unmatched", label: "Not linked to an investor" },
  { id: "all", label: "All mail" },
] as const;

type FolderId = (typeof FOLDERS)[number]["id"];

const AUTO_SYNC_MS = 2 * 60 * 1000;

export function InboxPage() {
  const user = useSession();
  const [folder, setFolder] = useState<FolderId>("inbox");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<EmailSetupStatus | null>(null);
  const [syncState, setSyncState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ key: number; defaults: ComposerDefaults; title: string; investorId: string | null } | null>(null);
  const requestRef = useRef(0);

  const loadEmails = useCallback(
    async (cursor: string | null) => {
      const requestId = ++requestRef.current;
      setIsLoading(true);
      const params = new URLSearchParams({ folder });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (cursor) params.set("cursor", cursor);
      try {
        const response = await fetch(`/api/emails?${params.toString()}`);
        if (!response.ok || requestId !== requestRef.current) return;
        const result: { data: EmailSummary[]; nextCursor: string | null } = await response.json();
        setEmails((previous) => (cursor ? [...previous, ...result.data] : result.data));
        setNextCursor(result.nextCursor);
      } finally {
        if (requestId === requestRef.current) setIsLoading(false);
      }
    },
    [folder, debouncedSearch]
  );

  const loadStatus = useCallback(() => {
    fetch("/api/email/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: EmailSetupStatus | null) => data && setStatus(data))
      .catch(() => undefined);
  }, []);

  const syncNow = useCallback(async () => {
    setSyncState({ busy: true, message: null });
    try {
      const response = await fetch("/api/email/sync", { method: "POST" });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setSyncState({ busy: false, message: result?.error ?? "Could not check mail" });
        return;
      }
      setSyncState({
        busy: false,
        message: result.busy ? "Already checking…" : result.imported > 0 ? `${result.imported} new message${result.imported === 1 ? "" : "s"}` : "Up to date",
      });
      if (result.imported > 0) {
        loadEmails(null);
        notifyMailChanged();
      }
      loadStatus();
    } catch {
      setSyncState({ busy: false, message: "Could not reach the server" });
    }
  }, [loadEmails, loadStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change
    loadEmails(null);
  }, [loadEmails]);

  // Check mail on open and every couple of minutes while the tab is visible.
  const syncRef = useRef(syncNow);
  useEffect(() => {
    syncRef.current = syncNow;
  }, [syncNow]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/email/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: EmailSetupStatus | null) => {
        if (cancelled || !data) return;
        setStatus(data);
        if (data.imapConfigured) syncRef.current();
      })
      .catch(() => undefined);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") syncRef.current();
    }, AUTO_SYNC_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  function openCompose(defaults: ComposerDefaults, title: string, investorId: string | null) {
    setComposer({ key: Date.now(), defaults, title, investorId });
  }

  const canSync = status?.imapConfigured ?? false;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />

      <div className="mx-auto max-w-[1400px] animate-page-in px-6 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{companyName(user.companyId)} inbox</h1>
            <p className="text-sm text-slate-500">
              {status?.fromAddress ?? "Mailbox not connected"}
              {status?.lastSyncedAt && ` · checked ${formatShortDate(status.lastSyncedAt)}`}
              {syncState.message && ` · ${syncState.message}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={syncNow}
              disabled={!canSync || syncState.busy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${syncState.busy ? "animate-spin" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
              </svg>
              {syncState.busy ? "Checking…" : "Check mail"}
            </button>
            <button
              type="button"
              onClick={() => openCompose({ to: [], subject: "", body: "" }, "New email", null)}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Compose
            </button>
          </div>
        </div>

        <div className="mb-5">
          <EmailSetupNotice status={status} />
        </div>

        <EmailStatsBar />

        {composer && (
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <EmailComposer
              key={composer.key}
              investorId={composer.investorId}
              defaults={composer.defaults}
              title={composer.title}
              setup={status}
              onCancel={() => setComposer(null)}
              onSent={({ ok }) => {
                if (ok) setComposer(null);
                loadEmails(null);
              }}
            />
          </section>
        )}

        <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {FOLDERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFolder(item.id)}
                className={`flex items-center justify-between whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  folder === item.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                {item.label}
                {item.id === "unread" && status?.unread ? (
                  <span className={`rounded-full px-1.5 text-xs ${folder === item.id ? "bg-white text-slate-900" : "bg-indigo-600 text-white"}`}>
                    {status.unread}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search subject, sender, recipient…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />
            </div>

            {isLoading && emails.length === 0 ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : emails.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-400">
                {canSync ? "No emails here yet." : "Emails will appear here once the mailbox is connected."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {emails.map((email) => {
                  const counterpart =
                    email.direction === "inbound"
                      ? email.from_name || email.from_address
                      : `To: ${email.to_addresses.join(", ")}`;
                  const unread = email.direction === "inbound" && !email.is_read;
                  const open = () => {
                    setViewingId(email.id);
                    if (unread) setEmails((previous) => previous.map((item) => (item.id === email.id ? { ...item, is_read: true } : item)));
                  };
                  return (
                    <li key={email.id} className="animate-fade-in">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={open}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            open();
                          }
                        }}
                        className="flex w-full cursor-pointer items-start gap-3 px-5 py-3.5 text-left outline-none transition-colors hover:bg-slate-50 focus-visible:bg-indigo-50/60"
                      >
                        <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-indigo-600" : "bg-transparent"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className={`truncate text-sm ${unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>{counterpart}</span>
                            <span className="shrink-0 text-xs text-slate-400">{formatShortDate(email.occurred_at)}</span>
                          </div>
                          <div className={`truncate text-sm ${unread ? "font-semibold text-slate-900" : "text-slate-800"}`}>
                            {email.subject || "(no subject)"}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-500">{email.snippet}</div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <EmailStatusBadge email={email} />
                            {email.direction === "outbound" && email.status === "sent" && email.opened_at && (
                              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-200">
                                Opened{email.open_count > 1 ? ` ${email.open_count}×` : ""}
                              </span>
                            )}
                            {email.investor_id && <InvestorChip id={email.investor_id} name={email.investor_name} />}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {nextCursor && (
              <div className="border-t border-slate-100 p-3 text-center">
                <button
                  type="button"
                  onClick={() => loadEmails(nextCursor)}
                  disabled={isLoading}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {isLoading ? "Loading…" : "Load older emails"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {viewingId && (
        <EmailViewer
          emailId={viewingId}
          onClose={() => setViewingId(null)}
          onReply={(email: EmailMessage) => {
            setViewingId(null);
            openCompose(buildReplyDefaults(email), "Reply", email.investor_id);
          }}
        />
      )}
    </div>
  );
}
