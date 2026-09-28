/** The companies sharing this portal. Each gets its own workspace. */
export const COMPANIES = [
  { id: "fabricvton", name: "FabricVTON", domain: "fabricvton.com", accent: "bg-indigo-600", soft: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  { id: "beatband", name: "BeatBand", domain: "beatband.in", accent: "bg-rose-600", soft: "bg-rose-50 text-rose-700 ring-rose-200" },
  { id: "naaradh", name: "Naaradh", domain: "naaradh.com", accent: "bg-emerald-600", soft: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
] as const;

export type Company = (typeof COMPANIES)[number];
export type CompanyId = Company["id"];

const BY_ID = new Map<string, Company>(COMPANIES.map((company) => [company.id, company]));

export function isCompanyId(value: unknown): value is CompanyId {
  return typeof value === "string" && BY_ID.has(value);
}

export function companyById(id: string | null | undefined): Company | null {
  return (id && BY_ID.get(id)) || null;
}

export function companyName(id: string | null | undefined): string {
  return companyById(id)?.name ?? id ?? "Unknown";
}

/** The company an email address belongs to, by domain; null for any other domain. */
export function companyForEmail(email: string): Company | null {
  const domain = email.trim().toLowerCase().split("@")[1];
  return COMPANIES.find((company) => company.domain === domain) ?? null;
}
