type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

export const FILTER_OPTIONS_CACHE_KEY = "investor-filter-options";
export const TOTAL_COUNT_CACHE_KEY = "investor-total-count";

export function invalidateCache(key: string) {
  store.delete(key);
}

/**
 * Minimal in-memory TTL cache. Lives per warm serverless instance /
 * long-running process, which is enough to keep cheap, rarely-changing
 * reads (filter options, total counts) off the database on every request.
 */
export async function getOrSetCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = store.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const value = await fetcher();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
