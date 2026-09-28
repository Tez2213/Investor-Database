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

/** Returns a safe https link for a stored URL, or null when the value isn't a URL. */
export function toHref(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/\s/.test(trimmed) || !/\.[a-z]{2,}/i.test(trimmed)) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
