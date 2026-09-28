"use client";

import { COMPANIES } from "../../lib/companies";
import {
  TEAM_SCORE_OPTIONS,
  type FilterOptions,
  type HasFilterValue,
  type InvestorFilters,
} from "../../lib/types";
import { SearchableSelect } from "./SearchableSelect";

type NonSearchFilters = Omit<InvestorFilters, "search">;

type FilterBarProps = {
  searchInput: string;
  onSearchChange: (value: string) => void;
  filters: NonSearchFilters;
  onFilterChange: <K extends keyof NonSearchFilters>(
    key: K,
    value: NonSearchFilters[K]
  ) => void;
  filterOptions: FilterOptions | null;
  onReset: () => void;
  hasActiveFilters: boolean;
};

const HAS_OPTIONS: { value: HasFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function FilterBar({
  searchInput,
  onSearchChange,
  filters,
  onFilterChange,
  filterOptions,
  onReset,
  hasActiveFilters,
}: FilterBarProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm shadow-slate-900/5 backdrop-blur sm:p-5">
      <div className="relative mb-4">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>

        <input
          type="text"
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name, company, email, city or ID (e.g. INV-000123)..."
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition-shadow focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchableSelect
          label="Countries"
          placeholder="Country"
          value={filters.country}
          options={filterOptions?.countries ?? []}
          onChange={(value) => onFilterChange("country", value)}
        />

        <SearchableSelect
          label="Industries"
          placeholder="Industry"
          value={filters.industry}
          options={filterOptions?.industries ?? []}
          onChange={(value) => onFilterChange("industry", value)}
        />

        <input
          type="text"
          value={filters.city}
          onChange={(event) => onFilterChange("city", event.target.value)}
          placeholder="City"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 sm:w-40"
        />

        <input
          type="text"
          value={filters.title}
          onChange={(event) => onFilterChange("title", event.target.value)}
          placeholder="Title"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 sm:w-40"
        />

        <select
          value={filters.quality}
          onChange={(event) => onFilterChange("quality", event.target.value)}
          className={`rounded-lg border px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-100 ${
            filters.quality
              ? "border-indigo-200 bg-indigo-50/60 text-indigo-900"
              : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          <option value="">Your quality: all</option>
          {(filterOptions?.qualities ?? []).map((quality) => (
            <option key={quality} value={quality}>
              {quality}
            </option>
          ))}
        </select>

        <select
          value={filters.teamScore}
          onChange={(event) => onFilterChange("teamScore", event.target.value)}
          title="Average rating across all three companies"
          className={`rounded-lg border px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-100 ${
            filters.teamScore
              ? "border-indigo-200 bg-indigo-50/60 text-indigo-900"
              : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          <option value="">Team score: all</option>
          {TEAM_SCORE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Team score: {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.source}
          onChange={(event) => onFilterChange("source", event.target.value)}
          className={`rounded-lg border px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-100 ${
            filters.source
              ? "border-indigo-200 bg-indigo-50/60 text-indigo-900"
              : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          <option value="">Source: all leads</option>
          <option value="original">Source: original database</option>
          <option value="uploaded">Source: uploaded by any company</option>
          {COMPANIES.map((company) => (
            <option key={company.id} value={company.id}>
              Source: added by {company.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
          <span className="text-slate-400">Email</span>
          <select
            value={filters.hasEmail}
            onChange={(event) =>
              onFilterChange("hasEmail", event.target.value as HasFilterValue)
            }
            className="bg-transparent font-medium text-slate-700 outline-none"
          >
            {HAS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
          <span className="text-slate-400">LinkedIn</span>
          <select
            value={filters.hasLinkedIn}
            onChange={(event) =>
              onFilterChange(
                "hasLinkedIn",
                event.target.value as HasFilterValue
              )
            }
            className="bg-transparent font-medium text-slate-700 outline-none"
          >
            {HAS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.985a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z"
                clipRule="evenodd"
              />
            </svg>
            Reset Filters
          </button>
        )}
      </div>
    </div>
  );
}
