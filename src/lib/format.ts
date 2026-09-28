import type { FieldSource } from "./types";

const QUALITY_STYLES: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  medium: "bg-violet-50 text-violet-700 ring-violet-700/20",
  low: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

const CUSTOM_QUALITY_STYLE = "bg-slate-100 text-slate-700 ring-slate-600/20";

export const SOURCE_STYLES: Record<
  FieldSource,
  { label: string; description: string; highlight: string; dot: string; input: string }
> = {
  predicted: {
    label: "Predicted",
    description: "Filled in automatically (from email, company or city). Please verify.",
    highlight: "rounded bg-amber-100 px-1 text-amber-900 ring-1 ring-amber-300",
    dot: "bg-amber-400",
    input: "border-amber-300 bg-amber-50",
  },
  edited: {
    label: "Edited",
    description: "Changed manually by someone on the team.",
    highlight: "rounded bg-sky-100 px-1 text-sky-900 ring-1 ring-sky-300",
    dot: "bg-sky-500",
    input: "border-sky-300 bg-sky-50",
  },
};

export function sourceHighlight(source: FieldSource | undefined): string {
  return source ? SOURCE_STYLES[source].highlight : "";
}

export function fullName(
  firstName: string | null,
  lastName: string | null
): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

export function initials(
  firstName: string | null,
  lastName: string | null
): string {
  const first = firstName?.trim()?.[0] ?? "";
  const last = lastName?.trim()?.[0] ?? "";
  const combined = `${first}${last}`.toUpperCase();
  return combined || "?";
}

/** "Tejasvi Kesarwani" → "TK"; "hello@x.com" → "HE". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0]?.slice(0, 2) ?? "";
  return letters.toUpperCase() || "?";
}

/** Team score (1–3) as a label: High ≥ 2.5, Medium ≥ 1.5, otherwise Low. */
export function teamScoreLabel(score: number | null): "High" | "Medium" | "Low" | null {
  if (score == null) return null;
  if (score >= 2.5) return "High";
  if (score >= 1.5) return "Medium";
  return "Low";
}

export function qualityBadgeClass(quality: string): string {
  return QUALITY_STYLES[quality.toLowerCase()] ?? CUSTOM_QUALITY_STYLE;
}

/** Short, permanent reference for an investor, e.g. id 123 → "INV-000123". */
export function investorCode(id: number | string): string {
  return `INV-${String(id).padStart(6, "0")}`;
}

/** Reads "INV-000123", "inv123", "#123" or "123" back into an id; null otherwise. */
export function parseInvestorCode(text: string): number | null {
  const match = /^(?:inv[-\s]?|#)?0*(\d{1,15})$/i.exec(text.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function formatCount(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US");
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today", "Yesterday", "September 26" or "September 26, 2025" (other years). */
export function dayLabel(value: string | Date): string {
  const date = new Date(value);
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

/** "12:13 PM" */
export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "Sep 26, 2026, 9:34 AM" */
export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact date for lists: time today, "Sep 26" this year, "Sep 26, 2025" otherwise. */
export function formatShortDate(value: string | Date): string {
  const date = new Date(value);
  const now = new Date();
  if (startOfDay(date) === startOfDay(now)) return formatTime(date);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Returns a safe https link for a stored URL, or null when the value isn't a URL. */
export function toHref(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/\s/.test(trimmed) || !/\.[a-z]{2,}/i.test(trimmed)) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
