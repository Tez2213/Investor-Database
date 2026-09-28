import type { Investor } from "./types";

/**
 * The last investor list shown on the dashboard. Opening a profile unmounts the
 * list, so this lets the back button restore the same rows and scroll position
 * instantly instead of reloading from the first page.
 */
export type InvestorListSnapshot = {
  filtersKey: string;
  investors: Investor[];
  cursor: number;
  hasMore: boolean;
  scrollY: number;
};

let snapshot: InvestorListSnapshot | null = null;

export function saveInvestorList(next: InvestorListSnapshot) {
  snapshot = next;
}

/** Returns the saved list if it was taken with the same search and filters. */
export function restoreInvestorList(filtersKey: string): InvestorListSnapshot | null {
  return snapshot && snapshot.filtersKey === filtersKey ? snapshot : null;
}

/** Keeps the saved list in step with edits made on a profile page. */
export function updateCachedInvestor(updated: Investor) {
  if (!snapshot) return;
  snapshot = {
    ...snapshot,
    investors: snapshot.investors.map((investor) => (investor.id === updated.id ? { ...investor, ...updated } : investor)),
  };
}
