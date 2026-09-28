import type { Investor } from "./types";
import { COMPANIES, companyName } from "./companies";
import { investorCode, teamScoreLabel } from "./format";

const CSV_COLUMNS: { header: string; value: (investor: Investor) => unknown }[] = [
  { header: "Investor ID", value: (investor) => investorCode(investor.id) },
  { header: "First Name", value: (investor) => investor.first_name },
  { header: "Last Name", value: (investor) => investor.last_name },
  { header: "Title", value: (investor) => investor.title },
  { header: "Company", value: (investor) => investor.company_name },
  { header: "Industry", value: (investor) => investor.industry },
  { header: "Email", value: (investor) => investor.email },
  { header: "LinkedIn", value: (investor) => investor.linkedin },
  { header: "Website", value: (investor) => investor.website },
  { header: "Company LinkedIn", value: (investor) => investor.company_linkedin_url },
  { header: "City", value: (investor) => investor.city },
  { header: "Country", value: (investor) => investor.country },
  { header: "Your Quality", value: (investor) => investor.quality },
  {
    header: "Team Score",
    value: (investor) =>
      investor.team_score == null ? "" : `${teamScoreLabel(investor.team_score)} (${investor.team_score.toFixed(1)})`,
  },
  ...COMPANIES.map((company) => ({
    header: `${company.name} Rating`,
    value: (investor: Investor) =>
      investor.team_ratings?.find((rating) => rating.company_id === company.id)?.quality ?? "",
  })),
  {
    header: "Added By",
    value: (investor) => (investor.source_company_id ? companyName(investor.source_company_id) : "Original database"),
  },
];

function escapeCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Prevent spreadsheet formula injection when the file is opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function investorsToCsv(investors: Investor[]): string {
  const header = CSV_COLUMNS.map((column) => column.header).join(",");
  const rows = investors.map((investor) => CSV_COLUMNS.map((column) => escapeCell(column.value(investor))).join(","));
  return [header, ...rows].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  // Leading BOM makes Excel read the file as UTF-8.
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
