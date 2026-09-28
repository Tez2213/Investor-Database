import { COMPANIES, companyById } from "../../lib/companies";
import { qualityBadgeClass, teamScoreLabel } from "../../lib/format";
import type { Investor } from "../../lib/types";

type ScoreSource = Pick<Investor, "team_score" | "team_votes" | "team_ratings">;

/** Average rating across companies, e.g. "High · 2.7 (2/3)". Hover shows each company's rating. */
export function TeamScoreBadge({ investor, size = "sm" }: { investor: ScoreSource; size?: "sm" | "md" }) {
  const label = teamScoreLabel(investor.team_score);
  const ratings = investor.team_ratings ?? [];
  const tooltip =
    COMPANIES.map((company) => {
      const rating = ratings.find((item) => item.company_id === company.id);
      return `${company.name}: ${rating?.quality ?? "not rated"}`;
    }).join("\n") + (investor.team_score != null ? `\nAverage: ${investor.team_score.toFixed(1)} of 3` : "");

  const padding = size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs";

  if (!label) {
    return (
      <span title={tooltip} className={`inline-flex items-center rounded-full bg-white font-medium text-slate-400 ring-1 ring-inset ring-slate-200 ${padding}`}>
        Unrated
      </span>
    );
  }

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset ${qualityBadgeClass(label)} ${padding}`}
    >
      {label}
      <span className="font-normal opacity-70">
        {investor.team_score?.toFixed(1)} · {investor.team_votes}/{COMPANIES.length}
      </span>
    </span>
  );
}

/** Watermark on leads uploaded by a company, e.g. "Added by BeatBand". */
export function SourceWatermark({ companyId, compact = false }: { companyId: string | null; compact?: boolean }) {
  const company = companyById(companyId);
  if (!company) return null;
  return (
    <span
      title={`Lead uploaded by ${company.name}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${company.soft}`}
    >
      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
        <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
      </svg>
      {compact ? company.name : `Added by ${company.name}`}
    </span>
  );
}
