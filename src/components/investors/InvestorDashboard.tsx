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
import { restoreInvestorList, saveInvestorList } from "../../lib/investorListCache";
import { track } from "../../lib/track";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { AppHeader } from "../AppHeader";
import { BulkActionsMenu } from "./BulkActionsMenu";
import { FilterBar } from "./FilterBar";
import { InvestorsTable } from "./InvestorsTable";

type NonSearchFilters = Omit<InvestorFilters, "search">;

const DEFAULT_NON_SEARCH_FILTERS: NonSearchFilters = {
  country: "",
  city: "",
  industry: "",
  title: "",
  quality: "",
  teamScore: "",
  source: "",
  contacted: "",
  hasEmail: "all",
  hasLinkedIn: "all",
};

const TEXT_FILTER_KEYS = ["country", "city", "industry", "title", "quality", "teamScore", "source", "contacted"] as const;

function parseHasParam(value: string | null): HasFilterValue {
  return value === "yes" || value === "no" ? value : "all";
}

function buildParams(activeFilters: InvestorFilters, cursor: number) {
  const params = new URLSearchParams();
  params.set("limit", "50");
  if (activeFilters.search) params.set("search", activeFilters.search);
  for (const key of TEXT_FILTER_KEYS) {
    if (activeFilters[key]) params.set(key, activeFilters[key]);
  }
  if (activeFilters.hasEmail !== "all") params.set("hasEmail", activeFilters.hasEmail);
  if (activeFilters.hasLinkedIn !== "all") params.set("hasLinkedIn", activeFilters.hasLinkedIn);
  if (cursor > 0) params.set("cursor", String(cursor));
  return params;
}

export function InvestorDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
  const [filters, setFilters] = useState<NonSearchFilters>(() => ({
    ...Object.fromEntries(TEXT_FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? ""])),
    hasEmail: parseHasParam(searchParams.get("hasEmail")),
    hasLinkedIn: parseHasParam(searchParams.get("hasLinkedIn")),
  }) as NonSearchFilters);

  const debouncedSearch = useDebouncedValue(searchInput, 350);

  const effectiveFilters: InvestorFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );
  const filtersKey = buildParams(effectiveFilters, 0).toString();

  const [investors, setInvestors] = useState<Investor[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [totalInvestors, setTotalInvestors] = useState<number | null>(null);
  // True when this person only sees the investors an admin assigned to them.
  const [assignedOnly, setAssignedOnly] = useState(false);
  // Checked rows persist across searches so a list can be built from several queries.
  const [checked, setChecked] = useState<Map<Investor["id"], Investor>>(() => new Map());

  const cursorRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Loads a page. A reset (new search/filters) cancels whatever is in flight so
   * results always match the latest query; "load more" is skipped while busy.
   */
  const fetchPage = useCallback(async (activeFilters: InvestorFilters, cursor: number, reset: boolean) => {
    if (!reset && loadingMoreRef.current) return;

    if (reset) {
      abortRef.current?.abort();
      setIsInitialLoading(true);
      setHasMore(true);
    } else {
      loadingMoreRef.current = true;
      setIsLoadingMore(true);
    }
    const controller = new AbortController();
    if (reset) abortRef.current = controller;
    setError(null);

    try {
      const response = await fetch(`/api/investors?${buildParams(activeFilters, cursor).toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const result: InvestorsResponse = await response.json();
      if (controller.signal.aborted) return;

      setInvestors((previous) => (reset ? result.data : [...previous, ...result.data]));
      cursorRef.current = result.nextCursor ?? 0;
      setHasMore(result.hasMore);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Unexpected error occurred");
      if (reset) setInvestors([]);
      setHasMore(false);
    } finally {
      if (reset) {
        if (!controller.signal.aborted) setIsInitialLoading(false);
      } else {
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, []);

  // Reload whenever the filters change, and keep the URL in sync so searches
  // and filters are shareable and survive a refresh.
  const isFirstLoadRef = useRef(true);
  useEffect(() => {
    loadingMoreRef.current = false;
    const saved = isFirstLoadRef.current ? restoreInvestorList(filtersKey) : null;
    isFirstLoadRef.current = false;
    if (saved) {
      // Back from a profile: show the same rows at the same scroll position.
      cursorRef.current = saved.cursor;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the list saved on the way out
      setInvestors(saved.investors);
      setHasMore(saved.hasMore);
      setIsInitialLoading(false);
      requestAnimationFrame(() => window.scrollTo(0, saved.scrollY));
    } else {
      cursorRef.current = 0;
      // Data-fetching-on-dependency-change effect (react.dev/learn/synchronizing-with-effects#fetching-data).
      fetchPage(effectiveFilters, 0, true);
    }

    const query = buildParams(effectiveFilters, 0);
    query.delete("limit");
    const queryString = query.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Remember the list when leaving the page (e.g. opening a profile).
  const listStateRef = useRef({ filtersKey, investors, hasMore, isInitialLoading, error });
  useEffect(() => {
    listStateRef.current = { filtersKey, investors, hasMore, isInitialLoading, error };
  });
  useEffect(
    () => () => {
      const state = listStateRef.current;
      if (state.isInitialLoading || state.error) return;
      saveInvestorList({
        filtersKey: state.filtersKey,
        investors: state.investors,
        cursor: cursorRef.current,
        hasMore: state.hasMore,
        scrollY: window.scrollY,
      });
    },
    []
  );

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
      .then((data: { totalInvestors: number; assignedOnly?: boolean } | null) => {
        if (!data) return;
        setTotalInvestors(data.totalInvestors);
        setAssignedOnly(Boolean(data.assignedOnly));
      })
      .catch(() => undefined);
  }, [loadFilterOptions]);

  // Swap freshly saved rows into the list and the selection.
  const applyUpdatedInvestors = useCallback((rows: Investor[]) => {
    const updated = new Map<Investor["id"], Investor>(rows.map((investor) => [investor.id, investor]));
    setInvestors((previous) => previous.map((investor) => updated.get(investor.id) ?? investor));
    setChecked((previous) => {
      if (!rows.some((investor) => previous.has(investor.id))) return previous;
      const next = new Map(previous);
      for (const [id, investor] of updated) {
        if (next.has(id)) next.set(id, investor);
      }
      return next;
    });
  }, []);

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
    const fileName = `investors-${date}-${rows.length}.csv`;
    downloadCsv(fileName, investorsToCsv(rows));
    track("csv_exported", { rows: rows.length, fileName });
  }, [checked]);

  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const showNotice = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice({ text, tone });
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  const copyValues = useCallback(
    async (values: (string | null)[], label: string, action: "emails_copied" | "linkedin_copied") => {
      const unique = Array.from(new Set(values.filter((value): value is string => Boolean(value))));
      if (unique.length === 0) {
        showNotice(`None of the selected investors have ${label}.`, "error");
        return;
      }
      try {
        await navigator.clipboard.writeText(unique.join("\n"));
        showNotice(`Copied ${unique.length.toLocaleString()} ${label} to clipboard.`);
        track(action, { count: unique.length });
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
        if (!response.ok) throw new Error(result?.error ?? `Update failed (status ${response.status})`);

        const rows = result.data as Investor[];
        applyUpdatedInvestors(rows);
        loadFilterOptions();
        showNotice(
          quality
            ? `Set your quality to "${quality}" for ${rows.length.toLocaleString()} investors.`
            : `Cleared your quality for ${rows.length.toLocaleString()} investors.`
        );
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "Update failed", "error");
      } finally {
        setIsBulkSaving(false);
      }
    },
    [checked, applyUpdatedInvestors, loadFilterOptions, showNotice]
  );

  // Shows the new rating immediately, then confirms with the server (or rolls back).
  const handleRowQuality = useCallback(
    async (investor: Investor, quality: string | null) => {
      applyUpdatedInvestors([{ ...investor, quality }]);
      try {
        const response = await fetch(`/api/investors/${investor.id}/company`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quality }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error ?? `Update failed (status ${response.status})`);
        applyUpdatedInvestors([result.data as Investor]);
        showNotice(
          quality
            ? `${investorCode(investor.id)}: your quality set to "${quality}".`
            : `${investorCode(investor.id)}: your quality cleared.`
        );
      } catch (err) {
        applyUpdatedInvestors([investor]);
        showNotice(err instanceof Error ? err.message : "Update failed", "error");
      }
    },
    [applyUpdatedInvestors, showNotice]
  );

  const checkedIds = useMemo(() => new Set(checked.keys()), [checked]);

  // A row opens the investor's full page; Cmd/Ctrl-click opens it in a new tab.
  const handleOpenInvestor = useCallback(
    (investor: Investor, event: React.MouseEvent) => {
      const href = `/investors/${investor.id}`;
      if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
      else router.push(href);
    },
    [router]
  );

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || isInitialLoading || !hasMore) return;
    fetchPage(effectiveFilters, cursorRef.current, false);
  }, [effectiveFilters, fetchPage, hasMore, isInitialLoading]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) loadMore();
        },
        { rootMargin: "600px" }
      );
      if (node) observerRef.current.observe(node);
    },
    [loadMore]
  );

  const handleFilterChange = useCallback(<K extends keyof NonSearchFilters>(key: K, value: NonSearchFilters[K]) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }, []);

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
      <AppHeader>
        <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 xl:flex">
          <span className="font-semibold uppercase tracking-wide text-slate-400">Legend</span>
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

        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {assignedOnly ? `${formatCount(totalInvestors)} assigned to you` : `${formatCount(totalInvestors)} Investors`}
        </div>
      </AppHeader>

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

      <div className="mx-auto max-w-[1600px] animate-page-in px-6 py-6">
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
                  : `Showing ${investors.length.toLocaleString()} loaded record${investors.length === 1 ? "" : "s"}`}
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
                  onCopyEmails={() => copyValues(Array.from(checked.values(), (i) => i.email), "emails", "emails_copied")}
                  onCopyLinkedIn={() =>
                    copyValues(Array.from(checked.values(), (i) => i.linkedin), "LinkedIn URLs", "linkedin_copied")
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
            onOpen={handleOpenInvestor}
            onHover={(investor) => router.prefetch(`/investors/${investor.id}`)}
            sentinelRef={sentinelRef}
            checkedIds={checkedIds}
            onToggleChecked={handleToggleChecked}
            onToggleAllChecked={handleToggleAllChecked}
            onQualityChange={handleRowQuality}
            noAssignments={assignedOnly && totalInvestors === 0}
          />
        </div>
      </div>
    </div>
  );
}
