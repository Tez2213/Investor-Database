"use client";

import { useEffect, useState } from "react";
import type { AdminOverview } from "../../lib/adminTypes";
import { companyById } from "../../lib/companies";
import { formatCount, formatDateTime } from "../../lib/format";

function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${tone}`}>{typeof value === "number" ? formatCount(value) : value}</div>
    </div>
  );
}

export function Overview({ onOpenActivity }: { onOpenActivity: (companyId: string) => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/overview")
      .then(async (res) => {
        const result = await res.json().catch(() => null);
        if (!res.ok) throw new Error(result?.error ?? "Could not load overview");
        return result as AdminOverview;
      })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="rounded-2xl bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>;
  if (!data) {
    return (
      <div className="grid gap-5 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-72 animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
    );
  }

  const { totals } = data;
  const rated = totals.teamScore.high + totals.teamScore.medium + totals.teamScore.low;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Investors in database" value={totals.investors} />
        <Stat label="Leads uploaded by companies" value={totals.uploadedLeads} />
        <Stat label="Actions today" value={totals.actionsToday} />
        <Stat label="Failed sign-ins (7 days)" value={totals.failedLogins7d} tone={totals.failedLogins7d > 0 ? "text-rose-600" : "text-slate-900"} />
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <div className="text-xs text-slate-500">Team score ({formatCount(rated)} rated)</div>
          <div className="mt-1 flex gap-2 text-sm font-semibold">
            <span className="text-emerald-700">{formatCount(totals.teamScore.high)} High</span>
            <span className="text-violet-700">{formatCount(totals.teamScore.medium)} Med</span>
            <span className="text-rose-700">{formatCount(totals.teamScore.low)} Low</span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {data.companies.map((row) => {
          const company = companyById(row.companyId);
          return (
            <section key={row.companyId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className={`h-1.5 ${company?.accent ?? "bg-slate-400"}`} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold">{company?.name}</h2>
                    <div className="text-xs text-slate-500">@{company?.domain}</div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      row.mailConnected ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"
                    }`}
                    title={row.mailbox ?? undefined}
                  >
                    {row.mailConnected ? "Mailbox connected" : "Mailbox not connected"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <Stat label="Active users" value={row.users} />
                  <Stat label="Used portal (7d)" value={row.activeUsers7d} />
                  <Stat label="Leads rated" value={row.rated} />
                  <Stat label="Rated High / Low" value={`${formatCount(row.ratedHigh)} / ${formatCount(row.ratedLow)}`} />
                  <Stat label="Emails sent" value={row.emailsSent} />
                  <Stat label="Emails received" value={row.emailsReceived} />
                  <Stat label="Comments" value={row.comments} />
                  <Stat label="Leads uploaded" value={row.leadsUploaded} />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>
                    {formatCount(row.actions7d)} actions this week
                    {row.lastActivityAt ? ` · last ${formatDateTime(row.lastActivityAt)}` : ""}
                  </span>
                  <button type="button" onClick={() => onOpenActivity(row.companyId)} className="font-medium text-indigo-600 hover:underline">
                    Activity →
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
