const QUALITY_PALETTE = [
  "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  "bg-blue-50 text-blue-700 ring-blue-700/20",
  "bg-amber-50 text-amber-700 ring-amber-600/20",
  "bg-violet-50 text-violet-700 ring-violet-700/20",
  "bg-rose-50 text-rose-700 ring-rose-600/20",
  "bg-slate-100 text-slate-700 ring-slate-600/20",
];

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
  let hash = 0;
  for (let i = 0; i < quality.length; i++) {
    hash = (hash * 31 + quality.charCodeAt(i)) % QUALITY_PALETTE.length;
  }
  return QUALITY_PALETTE[Math.abs(hash) % QUALITY_PALETTE.length];
}

export function formatCount(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US");
}
