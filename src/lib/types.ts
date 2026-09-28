export type Investor = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string | null;
  email: string | null;
  linkedin: string | null;
  quality: string | null;
  industry: string | null;
  website: string | null;
  company_linkedin_url: string | null;
  city: string | null;
  country: string | null;
  field_sources: FieldSources;
};

export type FieldSource = "predicted" | "edited";

export type FieldSources = Partial<Record<EditableInvestorField, FieldSource>>;

export type EditableInvestorField = Exclude<keyof Investor, "id" | "field_sources">;

export const QUALITY_OPTIONS = ["High", "Medium", "Low"] as const;

export const EDITABLE_FIELDS: { key: EditableInvestorField; label: string }[] = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "title", label: "Title" },
  { key: "company_name", label: "Company" },
  { key: "industry", label: "Industry" },
  { key: "email", label: "Email" },
  { key: "linkedin", label: "LinkedIn URL" },
  { key: "website", label: "Website" },
  { key: "company_linkedin_url", label: "Company LinkedIn URL" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "quality", label: "Quality" },
];

export type InvestorsResponse = {
  data: Investor[];
  nextCursor: number | null;
  hasMore: boolean;
};

export type HasFilterValue = "all" | "yes" | "no";

export type InvestorFilters = {
  search: string;
  country: string;
  city: string;
  industry: string;
  title: string;
  quality: string;
  hasEmail: HasFilterValue;
  hasLinkedIn: HasFilterValue;
};

export const EMPTY_FILTERS: InvestorFilters = {
  search: "",
  country: "",
  city: "",
  industry: "",
  title: "",
  quality: "",
  hasEmail: "all",
  hasLinkedIn: "all",
};

export type FilterOptions = {
  countries: string[];
  industries: string[];
  qualities: string[];
};
