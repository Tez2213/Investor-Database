"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  FilterOptions,
  HasFilterValue,
  Investor,
  InvestorFilters,
  InvestorsResponse,
} from "../../lib/types";
import { formatCount } from "../../lib/format";
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

  useEffect(() => {
    fetch("/api/investors/filters")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FilterOptions | null) => data && setFilterOptions(data))
      .catch(() => undefined);

    fetch("/api/stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { totalInvestors: number } | null) =>
        data && setTotalInvestors(data.totalInvestors)
      )
      .catch(() => undefined);
  }, []);

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

          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {formatCount(totalInvestors)} Investors
          </div>
        </div>
      </header>

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
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
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
          />
        </div>
      </div>

      <InvestorDrawer
        investor={selectedInvestor}
        onClose={() => setSelectedInvestor(null)}
      />
    </div>
  );
}
