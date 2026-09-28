const ADDRESS_PATTERN = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export function isValidAddress(value: string): boolean {
  return ADDRESS_PATTERN.test(value);
}

/** Normalises a list of addresses; returns null if any entry is invalid. */
export function cleanAddressList(value: unknown, max: number): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const address = item.trim().toLowerCase();
    if (!address) continue;
    if (!isValidAddress(address)) return null;
    if (!result.includes(address)) result.push(address);
  }
  return result.length > max ? null : result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text → simple HTML email body (paragraphs and line breaks). */
export function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 1em">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
  // A complete document: spam filters score bare HTML fragments (no <html>/<body>) as suspicious.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">${paragraphs}</div></body></html>`;
}

export function makeSnippet(text: string | null | undefined, length = 160): string | null {
  if (!text) return null;
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > length ? `${collapsed.slice(0, length - 1)}…` : collapsed;
}

/** Replaces {{first_name}}, {{last_name}}, {{full_name}} and {{company}} placeholders. */
export function renderTemplate(
  text: string,
  investor: { first_name: string | null; last_name: string | null; company_name: string | null } | null
): string {
  const first = investor?.first_name ?? "";
  const last = investor?.last_name ?? "";
  const values: Record<string, string> = {
    first_name: first || "there",
    last_name: last,
    full_name: [first, last].filter(Boolean).join(" ") || "there",
    company: investor?.company_name ?? "your company",
  };
  return text.replace(/\{\{\s*(first_name|last_name|full_name|company)\s*\}\}/g, (_, key: string) => values[key]);
}

export function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}
