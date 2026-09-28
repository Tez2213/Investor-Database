export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  company_id: string;
  role: "admin" | "member";
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  last_login_at: string | null;
  last_seen_at: string | null;
  actions_7d: number;
  /** "assigned": a member who only sees investors assigned to them. */
  access_mode: "all" | "assigned";
  assigned_count: number;
};

export type AssignedInvestorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string | null;
  country: string | null;
  email: string | null;
  assigned_at: string;
  assigned_by: string | null;
  batch_description: string | null;
};

export type AssignmentBatchRow = {
  id: string;
  description: string;
  added_count: number;
  current_count: number;
  created_by: string | null;
  created_at: string;
};

export type AssignmentsResponse = {
  user: { id: string; email: string; name: string | null; company_id: string; role: "admin" | "member"; access_mode: "all" | "assigned" };
  total: number;
  minId: string | null;
  maxId: string | null;
  batches: AssignmentBatchRow[];
  data: AssignedInvestorRow[];
  nextCursor: string | null;
};

export type AssignmentPreview = {
  description: string;
  matched: number;
  alreadyAssigned: number;
  toAdd: number;
  assignedToTeammates: number;
  notFound: number;
  minId: string | null;
  maxId: string | null;
  sample: { id: string; first_name: string | null; last_name: string | null; company_name: string | null; country: string | null }[];
};

export type PickerInvestorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string | null;
  country: string | null;
  email: string | null;
  assigned_to_user: boolean;
  other_assignees: { name: string; company_id: string }[];
};

export type AuditRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  company_id: string | null;
  action: string;
  investor_id: string | null;
  investor_name: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
};

export type CompanyOverview = {
  companyId: string;
  users: number;
  activeUsers7d: number;
  rated: number;
  ratedHigh: number;
  ratedLow: number;
  notes: number;
  comments: number;
  emailsSent: number;
  emailsReceived: number;
  leadsUploaded: number;
  actions7d: number;
  lastActivityAt: string | null;
  mailConnected: boolean;
  mailbox: string | null;
};

export type AdminOverview = {
  companies: CompanyOverview[];
  totals: {
    investors: number;
    uploadedLeads: number;
    teamScore: { high: number; medium: number; low: number };
    actionsToday: number;
    failedLogins7d: number;
  };
};

/** Human-readable labels for audit actions. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  login: "Signed in",
  login_failed: "Failed sign-in",
  logout: "Signed out",
  admin_login: "Signed in to admin portal",
  admin_login_failed: "Failed admin portal sign-in",
  admin_logout: "Signed out of admin portal",
  assignments_added: "Assigned investors",
  assignments_removed: "Removed assignments",
  assignments_transferred: "Transferred assignments",
  workspace_switched: "Switched workspace",
  profile_name_changed: "Changed their name",
  password_changed: "Changed their password",
  user_created: "Created a user",
  user_updated: "Updated a user",
  investor_viewed: "Viewed an investor",
  investor_updated: "Edited investor details",
  investor_company_data_updated: "Changed rating / notes / tags",
  bulk_update: "Bulk update",
  comment_added: "Added a comment",
  email_sent: "Sent an email",
  email_failed: "Email failed",
  mail_synced: "Synced mailbox",
  leads_uploaded: "Uploaded leads",
  csv_exported: "Downloaded CSV",
  emails_copied: "Copied emails",
  linkedin_copied: "Copied LinkedIn URLs",
};
