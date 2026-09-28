import { COMPANIES, companyName, isCompanyId } from "./companies";
import { investorCode, parseInvestorCode } from "./format";
import { outreachCondition, teamScoreCondition } from "./investorQuery";
import { QUALITY_OPTIONS } from "./types";

/**
 * Which investors to assign. Every way of assigning in the admin portal (an ID
 * range, a pasted or hand-picked list, or filters) is expressed as criteria;
 * all given conditions must match. The same criteria drive the preview and the
 * actual assignment, so the admin always gets exactly what was previewed.
 */
export type AssignmentCriteria = {
  idFrom?: string | number | null;
  idTo?: string | number | null;
  /** Explicit ids ("INV-000123", "123"…), from a pasted list or checkboxes. */
  ids?: (string | number)[] | null;
  search?: string | null;
  country?: string | null;
  city?: string | null;
  industry?: string | null;
  title?: string | null;
  /** "original" | "uploaded" | a company id */
  source?: string | null;
  /** The person's own company rating: High / Medium / Low / "unrated". */
  quality?: string | null;
  /** high | medium | low | unrated */
  teamScore?: string | null;
  hasEmail?: "yes" | "no" | "" | null;
  hasLinkedIn?: "yes" | "no" | "" | null;
  /** Emailed by the person's company: yes | no | replied */
  contacted?: string | null;
  /** Skip investors already assigned to a teammate in the same company. */
  onlyUnassigned?: boolean | null;
  /** Take only the first N matches (by ID), e.g. to hand out leads in chunks. */
  limit?: string | number | null;
};

export const MAX_EXPLICIT_IDS = 20_000;

type Built = {
  conditions: string[];
  limit: number | null;
  /** Human-readable summary kept with the batch, e.g. "INV-000001 – INV-000100 · Country: India". */
  description: string;
  requestedIds: number;
};

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function idOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const id = parseInvestorCode(String(value));
  return id !== null && id > 0 ? id : null;
}

/**
 * Turns criteria into SQL conditions on `investors i`. `param` adds a query
 * parameter and returns its placeholder; `companyParam` / `userParam` hold the
 * target person's company and user id. Returns an error message for bad input.
 */
export function buildAssignmentCriteria(
  criteria: AssignmentCriteria,
  { param, companyParam, userParam }: { param: (value: unknown) => string; companyParam: string; userParam: string }
): Built | { error: string } {
  const conditions: string[] = [];
  const parts: string[] = [];

  const hasFrom = criteria.idFrom != null && criteria.idFrom !== "";
  const hasTo = criteria.idTo != null && criteria.idTo !== "";
  const from = idOf(criteria.idFrom);
  const to = idOf(criteria.idTo);
  if ((hasFrom && from === null) || (hasTo && to === null)) {
    return { error: "Enter IDs like INV-000001 or 1" };
  }
  if (from !== null && to !== null && from > to) {
    return { error: "The first ID must be lower than the last ID" };
  }
  if (from !== null) conditions.push(`i.id >= ${param(from)}`);
  if (to !== null) conditions.push(`i.id <= ${param(to)}`);
  if (from !== null || to !== null) {
    parts.push(from !== null && to !== null ? `${investorCode(from)} – ${investorCode(to)}` : from !== null ? `From ${investorCode(from)}` : `Up to ${investorCode(to!)}`);
  }

  let requestedIds = 0;
  if (Array.isArray(criteria.ids) && criteria.ids.length > 0) {
    if (criteria.ids.length > MAX_EXPLICIT_IDS) {
      return { error: `Assign at most ${MAX_EXPLICIT_IDS.toLocaleString()} IDs at a time, or use a range` };
    }
    const ids = Array.from(new Set(criteria.ids.map(idOf).filter((id): id is number => id !== null)));
    if (ids.length === 0) return { error: "None of those IDs look valid" };
    requestedIds = ids.length;
    conditions.push(`i.id = ANY(${param(ids)}::bigint[])`);
    parts.push(ids.length === 1 ? investorCode(ids[0]) : `${ids.length.toLocaleString()} chosen investors`);
  }

  const search = text(criteria.search);
  if (search) {
    const like = param(`%${search}%`);
    conditions.push(`(i.first_name ILIKE ${like} OR i.last_name ILIKE ${like} OR i.company_name ILIKE ${like}
      OR i.title ILIKE ${like} OR i.email ILIKE ${like})`);
    parts.push(`Search: “${search}”`);
  }

  const country = text(criteria.country);
  if (country) {
    conditions.push(`i.country = ${param(country)}`);
    parts.push(`Country: ${country}`);
  }
  const city = text(criteria.city);
  if (city) {
    conditions.push(`i.city ILIKE ${param(`%${city}%`)}`);
    parts.push(`City: ${city}`);
  }
  const industry = text(criteria.industry);
  if (industry) {
    conditions.push(`i.industry = ${param(industry)}`);
    parts.push(`Industry: ${industry}`);
  }
  const title = text(criteria.title);
  if (title) {
    conditions.push(`i.title ILIKE ${param(`%${title}%`)}`);
    parts.push(`Title contains “${title}”`);
  }

  const source = text(criteria.source);
  if (source === "original") {
    conditions.push("i.source_company_id IS NULL");
    parts.push("Original database");
  } else if (source === "uploaded") {
    conditions.push("i.source_company_id IS NOT NULL");
    parts.push("Uploaded leads");
  } else if (isCompanyId(source)) {
    conditions.push(`i.source_company_id = ${param(source)}`);
    parts.push(`Added by ${companyName(source)}`);
  } else if (source) {
    return { error: "Unknown source" };
  }

  const quality = text(criteria.quality);
  if (quality === "unrated") {
    conditions.push(`NOT EXISTS (SELECT 1 FROM investor_company_data d
      WHERE d.investor_id = i.id AND d.company_id = ${companyParam} AND d.quality IS NOT NULL)`);
    parts.push("Not rated by their company");
  } else if ((QUALITY_OPTIONS as readonly string[]).includes(quality)) {
    conditions.push(`EXISTS (SELECT 1 FROM investor_company_data d
      WHERE d.investor_id = i.id AND d.company_id = ${companyParam} AND d.quality = ${param(quality)})`);
    parts.push(`Their company rated ${quality}`);
  } else if (quality) {
    return { error: "Unknown rating" };
  }

  const teamScore = text(criteria.teamScore);
  if (teamScore) {
    const scoreCondition = teamScoreCondition(teamScore);
    if (!scoreCondition) return { error: "Unknown team score" };
    conditions.push(`(${scoreCondition.replaceAll("team.score", `(SELECT avg(CASE lower(r.quality) WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END)
      FROM investor_company_data r WHERE r.investor_id = i.id AND r.quality IS NOT NULL)`)})`);
    parts.push(`Team score: ${teamScore}`);
  }

  if (criteria.hasEmail === "yes") {
    conditions.push("(i.email IS NOT NULL AND i.email <> '')");
    parts.push("Has email");
  } else if (criteria.hasEmail === "no") {
    conditions.push("(i.email IS NULL OR i.email = '')");
    parts.push("No email");
  }
  if (criteria.hasLinkedIn === "yes") {
    conditions.push("(i.linkedin IS NOT NULL AND i.linkedin <> '')");
    parts.push("Has LinkedIn");
  } else if (criteria.hasLinkedIn === "no") {
    conditions.push("(i.linkedin IS NULL OR i.linkedin = '')");
    parts.push("No LinkedIn");
  }

  const contacted = text(criteria.contacted);
  if (contacted) {
    const outreach = outreachCondition(contacted, companyParam);
    if (!outreach) return { error: "Unknown outreach filter" };
    conditions.push(outreach);
    parts.push(contacted === "yes" ? "Already emailed by their company" : contacted === "no" ? "Not emailed yet" : "Replied to their company");
  }

  if (criteria.onlyUnassigned) {
    conditions.push(`NOT EXISTS (SELECT 1 FROM user_investor_assignments a JOIN auth_users u ON u.id = a.user_id
      WHERE a.investor_id = i.id AND u.company_id = ${companyParam} AND a.user_id <> ${userParam})`);
    parts.push("Not assigned to a teammate");
  }

  let limit: number | null = null;
  if (criteria.limit != null && criteria.limit !== "") {
    limit = Number(criteria.limit);
    if (!Number.isSafeInteger(limit) || limit < 1) return { error: "“How many” must be a whole number above 0" };
    parts.push(`First ${limit.toLocaleString()}`);
  }

  if (conditions.length === 0) {
    return { error: "Choose at least one condition (a range, IDs or a filter)" };
  }

  return { conditions, limit, description: parts.join(" · "), requestedIds };
}

/** Lists the companies, for building the source options in the admin UI. */
export const SOURCE_CHOICES = [
  { value: "original", label: "Original database" },
  { value: "uploaded", label: "Uploaded by any company" },
  ...COMPANIES.map((company) => ({ value: company.id, label: `Added by ${company.name}` })),
];
