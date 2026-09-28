"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatShortDate, investorCode, qualityBadgeClass } from "../../lib/format";
import type { StatsDetailRow } from "../../lib/types";

export type StatsMetric = "sent" | "failed" | "opened" | "replied" | "received";

const METRIC_INFO: Record<StatsMetric, { title: string; countLabel: string; dateLabel: string; empty: string }> = {
  sent: { title: "Investors emailed", countLabel: "Emails", dateLabel: "Last sent", empty: "No emails sent in this period." },
  failed: { title: "Emails not delivered", countLabel: "Failed", dateLabel: "Last tried", empty: "Nothing failed in this period." },
  opened: { title: "Investors who opened", countLabel: "Emails opened", dateLabel: "Last opened", empty: "No opens yet in this period." },
  replied: { title: "Investors who replied", countLabel: "Replies", dateLabel: "Last reply", empty: "No replies yet in this period." },
  received: { title: "Emails received from", countLabel: "Emails", dateLabel: "Last received", empty: "Nothing received in this period." },
};

type DetailsResponse = { total: number; data: StatsDetailRow[]; nextOffset: number | null };

/** The investors behind the inbox number that was clicked. */
export function StatsDetails({
  metric,
  days,
  scope,
  onClose,
}: {
  metric: StatsMetric;
  days: number;
  scope: "mine" | "team";
  onClose: () => void;
}) {
  const [result, setResult] = useState<(DetailsResponse & { key: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${metric}|${days}|${scope}`;
  const info = METRIC_INFO[metric];

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/email/stats/details?metric=${metric}&days=${days}&scope=${scope}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Could not load the list");
        return data as DetailsResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setResult({ ...data, key });
        setError(null);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [metric, days, scope, key]);

  async function loadMore() {
    if (!result?.nextOffset) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/email/stats/details?metric=${metric}&days=${days}&scope=${scope}&offset=${result.nextOffset}`);
      const more = (await res.json()) as DetailsResponse;
      if (res.ok) setResult((current) => (current ? { ...more, key: current.key, data: [...current.data, ...more.data] } : current));
    } finally {
      setLoadingMore(false);
    }
  }

  const current = result?.key === key ? result : null;

  return (
    <div className="animate-fade-in mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">
          {info.title}
          {current && <span className="ml-2 font-normal text-slate-500">{current.total.toLocaleString()}</span>}
        </div>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
          Close
        </button>
      </div>

      {error && <div className="px-4 py-6 text-center text-sm text-rose-600">{error}</div>}

      {!error && !current && (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {current && current.data.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">{info.empty}</div>}

      {current && current.data.length > 0 && (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2">Investor</th>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Quality</th>
                <th className="px-4 py-2 text-right">{info.countLabel}</th>
                <th className="px-4 py-2">{info.dateLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {current.data.map((row) => {
                const href = row.investor_id ? `/investors/${row.investor_id}` : null;
                const nameCell = (
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {row.investor_id && (
                        <span className="rounded-full bg-slate-100 px-1.5 font-mono text-[11px] text-slate-600">{investorCode(row.investor_id)}</span>
                      )}
                      <span className="truncate font-medium text-slate-900">{row.name || row.address || "Unknown"}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {row.investor_id ? row.address : "Not linked to an investor"}
                      {row.note && <span className={metric === "failed" ? "text-rose-600" : "text-slate-400"}> · {row.note}</span>}
                    </div>
                  </div>
                );
                return (
                  <tr key={`${row.investor_id ?? ""}|${row.address ?? ""}`} className={href ? "hover:bg-indigo-50/40" : ""}>
                    <td className="max-w-[18rem] px-4 py-2">
                      {href ? (
                        <Link href={href} className="block hover:[&_span.font-medium]:text-indigo-700">
                          {nameCell}
                        </Link>
                      ) : (
                        nameCell
                      )}
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-2 text-slate-600">{row.company_name ?? "—"}</td>
                    <td className="px-4 py-2">
                      {row.quality ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${qualityBadgeClass(row.quality)}`}>{row.quality}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                      {row.count}
                      {metric === "opened" && row.opens > row.count && <span className="text-xs text-slate-400"> · {row.opens} opens</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">{row.last_at ? formatShortDate(row.last_at) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {current.nextOffset !== null && (
            <div className="border-t border-slate-100 p-3 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg px-4 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
