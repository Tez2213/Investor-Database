"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  FieldSource,
  FilterOptions,
  HasFilterValue,
  Investor,
  InvestorFilters,
  InvestorsResponse,
} from "../../lib/types";
import { SOURCE_STYLES, formatCount, investorCode } from "../../lib/format";
import { downloadCsv, investorsToCsv } from "../../lib/csv";
import { BulkActionsMenu } from "./BulkActionsMenu";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { FilterBar } from "./FilterBar";
import { InvestorsTable } from "./InvestorsTable";
import { InvestorDrawer } from "./InvestorDrawer";

type NonSearchFilters = Omit<InvestorFilters, "search">;

const DEFAULT_NON_SEARCH_FILTERS: NonSearchFilters = {
  country: "",
  city: "",
  industry: "",
  title: "",
  quality: "",
  hasEmail: "all",
  hasLinkedIn: "all",
};

function parseHasParam(value: string | null): HasFilterValue {
  return value === "yes" || value === "no" ? value : "all";
}

export function InvestorDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("search") ?? ""
  );
  const [filters, setFilters] = useState<NonSearchFilters>(() => ({
    country: searchParams.get("country") ?? "",
    city: searchParams.get("city") ?? "",
    industry: searchParams.get("industry") ?? "",
    title: searchParams.get("title") ?? "",
    quality: searchParams.get("quality") ?? "",
    hasEmail: parseHasParam(searchParams.get("hasEmail")),
    hasLinkedIn: parseHasParam(searchParams.get("hasLinkedIn")),
  }));

  const debouncedSearch = useDebouncedValue(searchInput, 400);

  const effectiveFilters: InvestorFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const [investors, setInvestors] = useState<Investor[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(
    null
  );
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(
    null
  );
  const [totalInvestors, setTotalInvestors] = useState<number | null>(null);
  // Checked rows persist across searches so a list can be built from several queries.
  const [checked, setChecked] = useState<Map<Investor["id"], Investor>>(
    () => new Map()
  );

  const cursorRef = useRef(0);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);

  const buildParams = useCallback(
    (activeFilters: InvestorFilters, cursor: number) => {
      const params = new URLSearchParams();
      params.set("limit", "50");

      if (activeFilters.search) params.set("search", activeFilters.search);
      if (activeFilters.country) params.set("country", activeFilters.country);
      if (activeFilters.city) params.set("city", activeFilters.city);
      if (activeFilters.industry) params.set("industry", activeFilters.industry);
      if (activeFilters.title) params.set("title", activeFilters.title);
      if (activeFilters.quality) params.set("quality", activeFilters.quality);
      if (activeFilters.hasEmail !== "all") {
        params.set("hasEmail", activeFilters.hasEmail);
      }
      if (activeFilters.hasLinkedIn !== "all") {
        params.set("hasLinkedIn", activeFilters.hasLinkedIn);
      }
      if (cursor > 0) params.set("cursor", String(cursor));

      return params;
    },
    []
  );

  const fetchPage = useCallback(
    async (activeFilters: InvestorFilters, cursor: number, reset: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;

      const requestId = ++requestIdRef.current;

      if (reset) {
        setIsInitialLoading(true);
        setHasMore(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const params = buildParams(activeFilters, cursor);
        const response = await fetch(`/api/investors?${params.toString()}`);

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const result: InvestorsResponse = await response.json();

        if (requestId !== requestIdRef.current) return;

        setInvestors((previous) =>
          reset ? result.data : [...previous, ...result.data]
        );
        cursorRef.current = result.nextCursor ?? 0;
        setHasMore(result.hasMore);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(
          err instanceof Error ? err.message : "Unexpected error occurred"
        );
        if (reset) setInvestors([]);
        setHasMore(false);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsInitialLoading(false);
          setIsLoadingMore(false);
        }
        loadingRef.current = false;
      }
    },
    [buildParams]
  );

  // Reload from scratch whenever the effective filters change, and keep the
  // URL in sync so searches/filters are shareable and survive a refresh.
  useEffect(() => {
    cursorRef.current = 0;
    // Data-fetching-on-dependency-change effect: fetchPage synchronously
    // resets loading/hasMore state before issuing the request, which is the
    // standard React pattern for fetch effects (react.dev/learn/synchronizing-with-effects#fetching-data).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPage(effectiveFilters, 0, true);

    const params = buildParams(effectiveFilters, 0);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveFilters.search,
    effectiveFilters.country,
    effectiveFilters.city,
    effectiveFilters.industry,
    effectiveFilters.title,
    effectiveFilters.quality,
    effectiveFilters.hasEmail,
    effectiveFilters.hasLinkedIn,
  ]);

  const loadFilterOptions = useCallback(() => {
    fetch("/api/investors/filters")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FilterOptions | null) => data && setFilterOptions(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadFilterOptions();

    fetch("/api/stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { totalInvestors: number } | null) =>
        data && setTotalInvestors(data.totalInvestors)
      )
      .catch(() => undefined);
  }, [loadFilterOptions]);

  // Swap freshly saved rows into the list, the selection and the open drawer.
  const applyUpdatedInvestors = useCallback(
    (rows: Investor[]) => {
      const updated = new Map<Investor["id"], Investor>(
        rows.map((investor) => [investor.id, investor])
      );
      setInvestors((previous) =>
        previous.map((investor) => updated.get(investor.id) ?? investor)
      );
      setChecked((previous) => {
        if (!rows.some((investor) => previous.has(investor.id))) return previous;
        const next = new Map(previous);
        for (const [id, investor] of updated) {
          if (next.has(id)) next.set(id, investor);
        }
        return next;
      });
      setSelectedInvestor((current) =>
        current ? updated.get(current.id) ?? current : current
      );
      loadFilterOptions();
    },
    [loadFilterOptions]
  );

  const handleInvestorSaved = useCallback(
    (updated: Investor) => applyUpdatedInvestors([updated]),
    [applyUpdatedInvestors]
  );

  const handleToggleChecked = useCallback((investor: Investor) => {
    setChecked((previous) => {
      const next = new Map(previous);
      if (next.has(investor.id)) next.delete(investor.id);
      else next.set(investor.id, investor);
      return next;
    });
  }, []);

  const handleToggleAllChecked = useCallback(() => {
    setChecked((previous) => {
      const next = new Map(previous);
      const allChecked = investors.every((investor) => next.has(investor.id));
      for (const investor of investors) {
        if (allChecked) next.delete(investor.id);
        else next.set(investor.id, investor);
      }
      return next;
    });
  }, [investors]);

  const handleDownload = useCallback(() => {
    const rows = Array.from(checked.values());
    if (rows.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`investors-${date}-${rows.length}.csv`, investorsToCsv(rows));
  }, [checked]);

  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(
    null
  );
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const showNotice = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice({ text, tone });
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  const copyValues = useCallback(
    async (values: (string | null)[], label: string) => {
      const unique = Array.from(new Set(values.filter((value): value is string => Boolean(value))));
      if (unique.length === 0) {
        showNotice(`None of the selected investors have ${label}.`, "error");
        return;
      }
      try {
        await navigator.clipboard.writeText(unique.join("\n"));
        showNotice(`Copied ${unique.length.toLocaleString()} ${label} to clipboard.`);
      } catch {
        showNotice("Could not access the clipboard.", "error");
      }
    },
    [showNotice]
  );

  const handleBulkQuality = useCallback(
    async (quality: string | null) => {
      const ids = Array.from(checked.keys());
      if (ids.length === 0) return;

      setIsBulkSaving(true);
      try {
        const response = await fetch("/api/investors/bulk-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, changes: { quality } }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.error ?? `Update failed (status ${response.status})`);
        }

        const rows = result.data as Investor[];
        applyUpdatedInvestors(rows);
        showNotice(
          quality
            ? `Set quality to "${quality}" for ${rows.length.toLocaleString()} investors.`
            : `Cleared quality for ${rows.length.toLocaleString()} investors.`
        );
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "Update failed", "error");
      } finally {
        setIsBulkSaving(false);
      }
    },
    [checked, applyUpdatedInvestors, showNotice]
  );

  const handleRowQuality = useCallback(
    async (investor: Investor, quality: string | null) => {
      try {
        const response = await fetch(`/api/investors/${investor.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quality }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.error ?? `Update failed (status ${response.status})`);
        }
        applyUpdatedInvestors([result.data as Investor]);
        showNotice(
          quality
            ? `${investorCode(investor.id)}: quality set to "${quality}".`
            : `${investorCode(investor.id)}: quality cleared.`
        );
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "Update failed", "error");
      }
    },
    [applyUpdatedInvestors, showNotice]
  );

  const checkedIds = useMemo(() => new Set(checked.keys()), [checked]);

  const handleCloseDrawer = useCallback(() => setSelectedInvestor(null), []);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    fetchPage(effectiveFilters, cursorRef.current, false);
  }, [effectiveFilters, fetchPage, hasMore]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) loadMore();
        },
        { rootMargin: "400px" }
      );

      if (node) observerRef.current.observe(node);
    },
    [loadMore]
  );

  const handleFilterChange = useCallback(
    <K extends keyof NonSearchFilters>(key: K, value: NonSearchFilters[K]) => {
      setFilters((previous) => ({ ...previous, [key]: value }));
    },
    []
  );

  const handleReset = useCallback(() => {
    setSearchInput("");
    setFilters(DEFAULT_NON_SEARCH_FILTERS);
  }, []);

  const hasActiveFilters =
    Boolean(searchInput) ||
    Object.entries(filters).some(([key, value]) =>
      key === "hasEmail" || key === "hasLinkedIn" ? value !== "all" : Boolean(value)
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Investor Database
            </h1>
            <p className="text-sm text-slate-500">
              Search and explore your investor network
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
              <span className="font-semibold uppercase tracking-wide text-slate-400">
                Legend
              </span>
              {(Object.keys(SOURCE_STYLES) as FieldSource[]).map((source) => (
                <span
                  key={source}
                  title={SOURCE_STYLES[source].description}
                  className={`${SOURCE_STYLES[source].highlight} cursor-help font-medium`}
                >
                  {SOURCE_STYLES[source].label}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {formatCount(totalInvestors)} Investors
            </div>
          </div>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
            notice.tone === "ok" ? "bg-slate-900 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="mb-6">
          <FilterBar
            searchInput={searchInput}
            onSearchChange={setSearchInput}
            filters={filters}
            onFilterChange={handleFilterChange}
            filterOptions={filterOptions}
            onReset={handleReset}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <div className="font-semibold text-slate-900">Results</div>
              <div className="text-sm text-slate-500">
                {isInitialLoading
                  ? "Loading investors..."
                  : `Showing ${investors.length.toLocaleString()} loaded record${
                      investors.length === 1 ? "" : "s"
                    }`}
              </div>
            </div>

            {checked.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
                  {checked.size.toLocaleString()} selected
                </span>
                <button
                  type="button"
                  onClick={() => setChecked(new Map())}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  Clear
                </button>
                <BulkActionsMenu
                  disabled={isBulkSaving}
                  onCopyEmails={() =>
                    copyValues(Array.from(checked.values(), (i) => i.email), "emails")
                  }
                  onCopyLinkedIn={() =>
                    copyValues(Array.from(checked.values(), (i) => i.linkedin), "LinkedIn URLs")
                  }
                  onSetQuality={handleBulkQuality}
                />
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                  </svg>
                  Download CSV
                </button>
              </div>
            )}
          </div>

          <InvestorsTable
            investors={investors}
            isInitialLoading={isInitialLoading}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            error={error}
            onRetry={() => fetchPage(effectiveFilters, 0, true)}
            onSelect={setSelectedInvestor}
            sentinelRef={sentinelRef}
            checkedIds={checkedIds}
            onToggleChecked={handleToggleChecked}
            onToggleAllChecked={handleToggleAllChecked}
            onQualityChange={handleRowQuality}
          />
        </div>
      </div>

      <InvestorDrawer
        investor={selectedInvestor}
        filterOptions={filterOptions}
        onClose={handleCloseDrawer}
        onSaved={handleInvestorSaved}
      />
    </div>
  );
}
