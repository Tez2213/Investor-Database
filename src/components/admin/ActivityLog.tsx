"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIT_ACTION_LABELS, type AdminUserRow, type AuditRow } from "../../lib/adminTypes";
import { COMPANIES, companyById, companyName } from "../../lib/companies";
import { dayLabel, formatTime } from "../../lib/format";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

const LIVE_REFRESH_MS = 15_000;

const ACTION_TONES: Record<string, string> = {
  login_failed: "bg-rose-50 text-rose-700 ring-rose-200",
  email_failed: "bg-rose-50 text-rose-700 ring-rose-200",
  user_created: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  user_updated: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  email_sent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  leads_uploaded: "bg-amber-50 text-amber-700 ring-amber-200",
  csv_exported: "bg-amber-50 text-amber-700 ring-amber-200",
  emails_copied: "bg-amber-50 text-amber-700 ring-amber-200",
};

function list(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

/** One-line human description of an audit entry's details. */
function describe(row: AuditRow): string {
  const d = row.details ?? {};
  switch (row.action) {
    case "login_failed":
      return {
        domain_not_allowed: "email domain not allowed",
        no_account: "no account with this email",
        wrong_password: d.locked ? "wrong password, account locked 15 min" : "wrong password",
        deactivated: "account is deactivated",
      }[String(d.reason)] ?? String(d.reason ?? "");
    case "investor_updated":
      return `changed ${list(d.fields)}`;
    case "investor_company_data_updated":
      return [d.quality !== undefined ? `quality → ${d.quality ?? "cleared"}` : null, Array.isArray(d.tags) ? `tags: ${list(d.tags) || "none"}` : null, list(d.fields).includes("notes") ? "notes edited" : null]
        .filter(Boolean)
        .join(" · ");
    case "bulk_update":
      return `${d.count} investors · ${list(d.fields)}${d.changes && typeof d.changes === "object" && "quality" in d.changes ? ` → ${(d.changes as { quality: unknown }).quality ?? "cleared"}` : ""}`;
    case "email_sent":
    case "email_failed":
      return `to ${list(d.to)} · “${d.subject ?? ""}”${d.error ? ` · ${d.error}` : ""}`;
    case "mail_synced":
      return `${d.imported} new messages`;
    case "leads_uploaded":
      return `${d.inserted} added · ${d.duplicates} duplicates · ${d.invalid} skipped${d.fileName ? ` · ${d.fileName}` : ""}`;
    case "csv_exported":
      return `${d.rows} rows${d.fileName ? ` · ${d.fileName}` : ""}`;
    case "emails_copied":
    case "linkedin_copied":
      return `${d.count} addresses`;
    case "workspace_switched":
      return `${companyName(String(d.from))} → ${companyName(String(d.to))}`;
    case "user_created":
      return `${d.email} (${d.role})`;
    case "user_updated":
      return `${d.email}: ${Object.keys(d)
        .filter((key) => !["userId", "email"].includes(key))
        .map((key) => (key === "password" ? "password reset" : `${key} → ${d[key]}`))
        .join(", ")}`;
    case "comment_added":
      return `${d.length} characters`;
    default:
      return "";
  }
}

export function ActivityLog({ initialFilter }: { initialFilter: { userId?: string; company?: string } }) {
  const [company, setCompany] = useState(initialFilter.company ?? "");
  const [userId, setUserId] = useState(initialFilter.userId ?? "");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [hideViews, setHideViews] = useState(false);
  const [live, setLive] = useState(true);
  const debouncedSearch = useDebouncedValue(search, 300);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const requestRef = useRef(0);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { data: AdminUserRow[] } | null) => data && setUsers(data.data))
      .catch(() => undefined);
  }, []);

  const load = useCallback(
    async (cursor: string | null, quiet = false) => {
      const requestId = ++requestRef.current;
      if (!quiet) setIsLoading(true);
      const params = new URLSearchParams();
      if (company) params.set("company", company);
      if (userId) params.set("userId", userId);
      if (action) params.set("action", action);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (cursor) params.set("cursor", cursor);
      try {
        const response = await fetch(`/api/admin/audit?${params.toString()}`);
        if (!response.ok || requestId !== requestRef.current) return;
        const result: { data: AuditRow[]; nextCursor: string | null } = await response.json();
        setRows((previous) => (cursor ? [...previous, ...result.data] : result.data));
        if (!cursor || !quiet) setNextCursor(result.nextCursor);
      } finally {
        if (requestId === requestRef.current) setIsLoading(false);
      }
    },
    [company, userId, action, debouncedSearch]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change
    load(null);
  }, [load]);

  // Live mode: refresh the newest page quietly while the tab is visible.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(null, true);
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  const visible = hideViews ? rows.filter((row) => row.action !== "investor_viewed") : rows;
  const groups: { label: string; items: AuditRow[] }[] = [];
  for (const row of visible) {
    const label = dayLabel(row.created_at);
    const group = groups[groups.length - 1];
    if (group?.label === label) group.items.push(row);
    else groups.push({ label, items: [row] });
  }

  const select = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email, action, details…" className={`min-w-56 flex-1 ${select}`} />
        <select value={company} onChange={(event) => setCompany(event.target.value)} className={select}>
          <option value="">All companies</option>
          {COMPANIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select value={userId} onChange={(event) => setUserId(event.target.value)} className={select}>
          <option value="">Everyone</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name ? `${user.name} (${user.email})` : user.email}
            </option>
          ))}
        </select>
        <select value={action} onChange={(event) => setAction(event.target.value)} className={select}>
          <option value="">All actions</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={hideViews} onChange={(event) => setHideViews(event.target.checked)} className="accent-indigo-600" />
          Hide profile views
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} className="accent-indigo-600" />
          Live
          {live && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
        </label>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading && rows.length === 0 ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-9 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-400">No activity matches these filters.</div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div className="sticky top-[57px] z-10 border-y border-slate-100 bg-slate-50/95 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                {group.label}
              </div>
              <ul className="divide-y divide-slate-100">
                {group.items.map((row) => {
                  const rowCompany = companyById(row.company_id);
                  const detail = describe(row);
                  return (
                    <li key={row.id} className="flex items-start gap-4 px-5 py-3 text-sm">
                      <time className="w-16 shrink-0 pt-0.5 text-xs text-slate-400" dateTime={row.created_at} title={new Date(row.created_at).toLocaleString()}>
                        {formatTime(row.created_at)}
                      </time>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-slate-900">{row.user_name || row.user_email || "Unknown"}</span>
                          {rowCompany && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${rowCompany.soft}`}>
                              {rowCompany.name}
                            </span>
                          )}
                          <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ACTION_TONES[row.action] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>
                            {AUDIT_ACTION_LABELS[row.action] ?? row.action}
                          </span>
                          {row.investor_id && (
                            <Link href={`/investors/${row.investor_id}`} className="truncate text-indigo-600 hover:underline">
                              {row.investor_name || `Investor #${row.investor_id}`}
                            </Link>
                          )}
                        </div>
                        {detail && <div className="mt-0.5 truncate text-xs text-slate-500" title={detail}>{detail}</div>}
                      </div>
                      <div className="hidden shrink-0 text-right text-xs text-slate-400 md:block" title={row.user_agent ?? undefined}>
                        {row.ip ?? ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}

        {nextCursor && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button
              type="button"
              onClick={() => load(nextCursor)}
              disabled={isLoading}
              className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {isLoading ? "Loading…" : "Load older activity"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
