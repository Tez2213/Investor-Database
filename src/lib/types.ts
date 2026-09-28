/** One company's rating of an investor. */
export type TeamRating = { company_id: string; quality: string };

export type Investor = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string | null;
  email: string | null;
  linkedin: string | null;
  industry: string | null;
  website: string | null;
  company_linkedin_url: string | null;
  city: string | null;
  country: string | null;
  field_sources: FieldSources;
  /** Company that uploaded this lead (watermark); null for the original database. */
  source_company_id: string | null;
  uploaded_at: string | null;
  /** The signed-in company's own rating. */
  quality: string | null;
  /** Average rating across companies (High=3, Medium=2, Low=1); null when nobody rated. */
  team_score: number | null;
  team_votes: number;
  team_ratings: TeamRating[];
  /** Emails your company sent this investor (other companies' mail is never included). */
  mails_sent: number;
  last_mailed_at: string | null;
  /** Who on your team sent the latest one. */
  last_mailed_by: string | null;
  /** The investor has written to your company. */
  has_replied: boolean;
};

export type FieldSource = "predicted" | "edited";

export type EditableInvestorField =
  | "first_name"
  | "last_name"
  | "title"
  | "company_name"
  | "industry"
  | "email"
  | "linkedin"
  | "website"
  | "company_linkedin_url"
  | "city"
  | "country";

export type FieldSources = Partial<Record<EditableInvestorField | "quality", FieldSource>>;

export const QUALITY_OPTIONS = ["High", "Medium", "Low"] as const;

export const TEAM_SCORE_OPTIONS = [
  { value: "high", label: "High (2.5+)" },
  { value: "medium", label: "Medium (1.5–2.5)" },
  { value: "low", label: "Low (below 1.5)" },
  { value: "unrated", label: "Not rated yet" },
] as const;

export const CONTACTED_OPTIONS = [
  { value: "yes", label: "Emailed by us" },
  { value: "no", label: "Not emailed yet" },
  { value: "replied", label: "Replied to us" },
] as const;

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
  /** "" | high | medium | low | unrated */
  teamScore: string;
  /** "" (all) | "original" | "uploaded" | a company id */
  source: string;
  /** "" (all) | "yes" | "no" | "replied": emailed by your company */
  contacted: string;
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
  teamScore: "",
  source: "",
  contacted: "",
  hasEmail: "all",
  hasLinkedIn: "all",
};

export type FilterOptions = {
  countries: string[];
  industries: string[];
  qualities: string[];
};

/** Full investor record for the profile page: list fields plus this company's notes and tags. */
export type InvestorProfile = Investor & {
  notes: string | null;
  tags: string[];
  uploaded_by_email: string | null;
};

export type LeadImportSummary = {
  id: string;
  total: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  /** Ids of the leads created by this request. */
  insertedIds?: string[];
  /** Ids of existing investors that rows in this request matched. */
  duplicateIds?: string[];
};

export type InvestorProfileResponse = {
  data: InvestorProfile;
  prevId: string | null;
  nextId: string | null;
  stats: {
    emailsSent: number;
    emailsOpened: number;
    emailsReceived: number;
    comments: number;
    lastEmailAt: string | null;
  };
};

export type ActivityKind =
  | "comment"
  | "field_change"
  | "email_sent"
  | "email_failed"
  | "email_received"
  | "email_opened"
  | "notes_updated"
  | "tags_updated";

export type FieldChange = {
  field: EditableInvestorField | "quality";
  from: string | null;
  to: string | null;
};

export type ActivityDetails = {
  changes?: FieldChange[];
  bulk?: boolean;
  added?: string[];
  removed?: string[];
};

export type EmailDirection = "outbound" | "inbound";
export type EmailStatus = "sent" | "failed" | "received";

/** Email fields shown in lists and on the timeline (no bodies). */
export type EmailSummary = {
  id: string;
  investor_id: string | null;
  direction: EmailDirection;
  status: EmailStatus;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  snippet: string | null;
  error: string | null;
  is_read: boolean;
  occurred_at: string;
  /** First time the recipient opened it (sent emails with open tracking only). */
  opened_at: string | null;
  open_count: number;
  investor_name?: string | null;
};

export type EmailMessage = EmailSummary & {
  text_body: string | null;
  html_body: string | null;
  message_id: string;
  in_reply_to: string | null;
  thread_id: string;
  sent_by: string | null;
};

export type Activity = {
  id: string;
  investor_id: string;
  kind: ActivityKind;
  actor: string | null;
  body: string | null;
  details: ActivityDetails;
  email_id: string | null;
  created_at: string;
  email: EmailSummary | null;
};

export type ActivitiesResponse = {
  data: Activity[];
  nextCursor: string | null;
};

/** Outreach numbers for the Inbox page. */
/** A person's saved subject/body snippet for the email composer. */
export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  updated_at: string;
};

export type EmailStats = {
  days: number;
  sent: number;
  failed: number;
  /** Sent emails that carried the open-tracking image. */
  tracked: number;
  opened: number;
  received: number;
  investorsContacted: number;
  investorsReplied: number;
};

export type EmailSetupStatus = {
  smtpConfigured: boolean;
  imapConfigured: boolean;
  fromAddress: string | null;
  fromName: string | null;
  lastSyncedAt: string | null;
  unread: number;
};

export type SendEmailRequest = {
  investorId?: string | number | null;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  replyToEmailId?: string | number | null;
};
