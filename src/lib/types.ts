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
};

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
