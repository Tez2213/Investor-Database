"use client";

import { useEffect, useState } from "react";
import type { EmailStats } from "../../lib/types";
import { useOptionalSession } from "../SessionProvider";
import { StatsDetails, type StatsMetric } from "./StatsDetails";

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All time" },
] as const;

function percent(part: number, whole: number): string {
  if (whole === 0) return "—";
  const value = (part / whole) * 100;
  return `${value >= 10 || value === 0 ? Math.round(value) : value.toFixed(1)}%`;
}

function StatCard({
  label,
  value,
  detail,
  accent,
  rate,
  active,
  onClick,
}: {
  label: string;
  value: number | null;
  detail: string;
  accent: string;
  rate?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title="Show the investors"
      className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        active ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        {label}
      </div>
      {value === null ? (
        <div className="mt-2 h-8 w-20 animate-pulse rounded-md bg-slate-100" />
      ) : (
        <div className="mt-1 flex items-baseline gap-2 animate-fade-in">
          <span className="text-2xl font-semibold tabular-nums text-slate-900">{value.toLocaleString()}</span>
          {rate && <span className="text-sm font-semibold text-slate-500">{rate}</span>}
        </div>
      )}
      <div className="mt-1 truncate text-xs text-slate-400">{detail}</div>
    </button>
  );
}

function Toggle<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2.5 py-1 transition-colors ${
            value === option.value ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const SCOPES = [
  { value: "mine", label: "Mine" },
  { value: "team", label: "Team" },
] as const;

/** Sent / not delivered / opened / replied / received numbers, for you or the whole team. */
export function EmailStatsBar() {
  const user = useOptionalSession();
  // Members start with their own numbers, admins with the whole team's.
  const [scope, setScope] = useState<"mine" | "team">(user?.role === "admin" ? "team" : "mine");
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [open, setOpen] = useState<StatsMetric | null>(null);
  const card = (metric: StatsMetric) => ({ active: open === metric, onClick: () => setOpen(open === metric ? null : metric) });

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch(`/api/email/stats?days=${days}&scope=${scope}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: EmailStats | null) => !cancelled && data && setStats(data))
        .catch(() => undefined);
    }
    load();
    window.addEventListener("mail:changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("mail:changed", load);
    };
  }, [days, scope]);

  // Keep showing the previous numbers while a new period loads, so nothing jumps.
  const current = stats && stats.days === days && stats.scope === scope ? stats : null;
  const shown = current ?? stats;
  const loading = shown === null;
  const attempted = shown ? shown.sent + shown.failed - (shown.sent - shown.delivered) : 0;

  return (
    <section className="mb-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          {scope === "mine" ? "Your outreach" : "Team outreach"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Toggle options={SCOPES} value={scope} onChange={setScope} />
          <Toggle options={PERIODS.map((period) => ({ value: period.days, label: period.label }))} value={days} onChange={setDays} />
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-5 ${current || loading ? "opacity-100" : "opacity-60"}`}>
        <StatCard
          label="Emails sent"
          {...card("sent")}
          accent="bg-indigo-500"
          value={loading ? null : shown.sent}
          detail={loading ? " " : `${shown.delivered.toLocaleString()} delivered · ${shown.investorsContacted.toLocaleString()} investors`}
        />
        <StatCard
          label="Not delivered"
          {...card("failed")}
          accent="bg-rose-500"
          value={loading ? null : shown.failed}
          rate={loading || shown.failed === 0 ? undefined : percent(shown.failed, attempted)}
          detail={loading ? " " : "Refused or bounced back"}
        />
        <StatCard
          label="Opened by investor"
          {...card("opened")}
          accent="bg-teal-500"
          value={loading ? null : shown.opened}
          rate={loading ? undefined : percent(shown.opened, shown.tracked)}
          detail={loading ? " " : "Open rate of delivered emails"}
        />
        <StatCard
          label="Investors replied"
          {...card("replied")}
          accent="bg-emerald-500"
          value={loading ? null : shown.investorsReplied}
          rate={loading ? undefined : percent(shown.investorsReplied, shown.investorsContacted)}
          detail={loading ? " " : `Of ${shown.investorsContacted.toLocaleString()} reached`}
        />
        <StatCard
          label="Emails received"
          {...card("received")}
          accent="bg-amber-500"
          value={loading ? null : shown.received}
          detail={scope === "mine" ? "Replies to your emails" : "In the team inbox"}
        />
      </div>

      {open && <StatsDetails metric={open} days={days} scope={scope} onClose={() => setOpen(null)} />}
    </section>
  );
}
