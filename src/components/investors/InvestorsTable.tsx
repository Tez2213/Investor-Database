"use client";

import type { Investor } from "../../lib/types";
import { fullName, initials, sourceHighlight } from "../../lib/format";
import { SourceWatermark, TeamScoreBadge } from "./Badges";
import { InvestorIdBadge } from "./InvestorIdBadge";
import { QualitySelect } from "./QualitySelect";

type InvestorsTableProps = {
  investors: Investor[];
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onRetry: () => void;
  /** Opens the investor's page (the event tells whether Cmd/Ctrl was held). */
  onOpen: (investor: Investor, event: React.MouseEvent) => void;
  /** Lets the page start loading the profile before the click. */
  onHover?: (investor: Investor) => void;
  sentinelRef: (node: HTMLTableRowElement | null) => void;
  checkedIds: ReadonlySet<Investor["id"]>;
  onToggleChecked: (investor: Investor) => void;
  onToggleAllChecked: () => void;
  onQualityChange: (investor: Investor, quality: string | null) => Promise<void>;
};

const COLUMN_COUNT = 9;

const CHECKBOX_CLASS =
  "h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600";

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, index) => (
        <tr key={index} className="border-b border-slate-100">
          {Array.from({ length: COLUMN_COUNT }).map((__, cellIndex) => (
            <td key={cellIndex} className="px-5 py-4">
              <div className="h-3.5 animate-pulse rounded bg-slate-100" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function InvestorsTable({
  investors,
  isInitialLoading,
  isLoadingMore,
  hasMore,
  error,
  onRetry,
  onOpen,
  onHover,
  sentinelRef,
  checkedIds,
  onToggleChecked,
  onToggleAllChecked,
  onQualityChange,
}: InvestorsTableProps) {
  const checkedLoadedCount = investors.filter((investor) =>
    checkedIds.has(investor.id)
  ).length;
  const allLoadedChecked =
    investors.length > 0 && checkedLoadedCount === investors.length;
  const someLoadedChecked = checkedLoadedCount > 0 && !allLoadedChecked;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
          <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="text-sm font-medium text-slate-700">
          Something went wrong while loading investors.
        </div>
        <div className="text-sm text-slate-500">{error}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!isInitialLoading && investors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="text-sm font-medium text-slate-700">
          No investors found.
        </div>
        <div className="text-sm text-slate-500">
          Try changing your search or filters.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1200px] text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
          <tr>
            <th className="w-12 py-3 pl-5 pr-0">
              <input
                type="checkbox"
                aria-label="Select all loaded investors"
                className={CHECKBOX_CLASS}
                checked={allLoadedChecked}
                ref={(node) => {
                  if (node) node.indeterminate = someLoadedChecked;
                }}
                onChange={onToggleAllChecked}
                disabled={isInitialLoading || investors.length === 0}
              />
            </th>
            <th className="px-5 py-3">ID</th>
            <th className="px-5 py-3">Investor</th>
            <th className="px-5 py-3">Company</th>
            <th className="px-5 py-3">Industry</th>
            <th className="px-5 py-3">Location</th>
            <th className="px-5 py-3">Contact</th>
            <th className="px-5 py-3">Your quality</th>
            <th className="px-5 py-3" title="Average rating across all three companies">
              Team score
            </th>
          </tr>
        </thead>

        <tbody>
          {isInitialLoading ? (
            <SkeletonRows />
          ) : (
            investors.map((investor, index) => {
              const name = fullName(investor.first_name, investor.last_name);
              const location = [investor.city, investor.country]
                .filter(Boolean)
                .join(", ");
              const isLast = index === investors.length - 1;
              const isChecked = checkedIds.has(investor.id);
              const sources = investor.field_sources ?? {};

              return (
                <tr
                  key={investor.id}
                  ref={isLast ? sentinelRef : null}
                  onClick={(event) => onOpen(investor, event)}
                  onMouseEnter={() => onHover?.(investor)}
                  className={`cursor-pointer border-b border-slate-100 transition-colors ${
                    isChecked ? "bg-indigo-50/60" : "hover:bg-indigo-50/40"
                  }`}
                >
                  <td
                    className="w-12 py-3.5 pl-5 pr-0"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${name || "investor"}`}
                      className={CHECKBOX_CLASS}
                      checked={isChecked}
                      onChange={() => onToggleChecked(investor)}
                    />
                  </td>

                  <td className="whitespace-nowrap px-5 py-3.5">
                    <InvestorIdBadge id={investor.id} />
                  </td>

                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                        {initials(investor.first_name, investor.last_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2 font-medium text-slate-900">
                          <span className={`truncate ${sourceHighlight(sources.first_name ?? sources.last_name)}`}>
                            {name || "—"}
                          </span>
                          <SourceWatermark companyId={investor.source_company_id} compact />
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          <span className={sourceHighlight(sources.title)}>
                            {investor.title || "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="max-w-[200px] truncate px-5 py-3.5 text-slate-700">
                    <span className={sourceHighlight(sources.company_name)}>
                      {investor.company_name || "—"}
                    </span>
                  </td>

                  <td className="max-w-[160px] truncate px-5 py-3.5 text-slate-700">
                    <span className={investor.industry ? sourceHighlight(sources.industry) : ""}>
                      {investor.industry || "—"}
                    </span>
                  </td>

                  <td className="max-w-[160px] truncate px-5 py-3.5 text-slate-700">
                    <span className={location ? sourceHighlight(sources.city ?? sources.country) : ""}>
                      {location || "—"}
                    </span>
                  </td>

                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      {investor.email && (
                        <span
                          title="Has email"
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-600"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M3 4a2 2 0 00-2 2v.01L10 12l9-5.99V6a2 2 0 00-2-2H3z" />
                            <path d="M18 8.118l-8 5.333-8-5.333V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                          </svg>
                        </span>
                      )}
                      {investor.linkedin && (
                        <span
                          title="Has LinkedIn"
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
                          </svg>
                        </span>
                      )}
                      {!investor.email && !investor.linkedin && (
                        <span className="text-slate-300">—</span>
                      )}
                    </div>
                  </td>

                  <td
                    className="px-5 py-3.5"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <QualitySelect investor={investor} onChange={onQualityChange} />
                  </td>

                  <td className="whitespace-nowrap px-5 py-3.5">
                    <TeamScoreBadge investor={investor} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-center border-t border-slate-100 px-6 py-5">
        {isLoadingMore && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <svg className="h-4 w-4 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Loading more investors...
          </div>
        )}

        {!isLoadingMore && !hasMore && investors.length > 0 && (
          <div className="text-sm text-slate-400">
            You&apos;ve reached the end of the results.
          </div>
        )}
      </div>
    </div>
  );
}
