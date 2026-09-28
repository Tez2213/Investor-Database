import type { Investor } from "./types";
import { investorCode } from "./format";

const CSV_COLUMNS: { key: keyof Investor; header: string }[] = [
  { key: "id", header: "Investor ID" },
  { key: "first_name", header: "First Name" },
  { key: "last_name", header: "Last Name" },
  { key: "title", header: "Title" },
  { key: "company_name", header: "Company" },
  { key: "industry", header: "Industry" },
  { key: "email", header: "Email" },
  { key: "linkedin", header: "LinkedIn" },
  { key: "website", header: "Website" },
  { key: "company_linkedin_url", header: "Company LinkedIn" },
  { key: "city", header: "City" },
  { key: "country", header: "Country" },
  { key: "quality", header: "Quality" },
];

function escapeCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Prevent spreadsheet formula injection when the file is opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function investorsToCsv(investors: Investor[]): string {
  const header = CSV_COLUMNS.map((column) => column.header).join(",");
  const rows = investors.map((investor) =>
    CSV_COLUMNS.map((column) =>
      escapeCell(column.key === "id" ? investorCode(investor.id) : investor[column.key])
    ).join(",")
  );
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
