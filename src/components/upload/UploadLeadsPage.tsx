"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { companyById, companyName } from "../../lib/companies";
import { parseCsv } from "../../lib/csvParse";
import { formatDateTime } from "../../lib/format";
import { EDITABLE_FIELDS, type EditableInvestorField, type LeadImportSummary } from "../../lib/types";
import { AppHeader } from "../AppHeader";
import { useSession } from "../SessionProvider";
import { SourceWatermark } from "../investors/Badges";

type TargetField = EditableInvestorField | "quality" | "full_name" | "";

const TARGETS: { value: TargetField; label: string }[] = [
  { value: "", label: "— Skip this column —" },
  { value: "full_name", label: "Full name (split into first + last)" },
  ...EDITABLE_FIELDS.map((field) => ({ value: field.key as TargetField, label: field.label })),
  { value: "quality", label: "Your quality rating" },
];

/** Header text → field, for automatic column matching. */
const SYNONYMS: [RegExp, TargetField][] = [
  [/^(first\s*name|firstname|first|given\s*name|fname)$/, "first_name"],
  [/^(last\s*name|lastname|last|surname|family\s*name|lname)$/, "last_name"],
  [/^(name|full\s*name|contact\s*name|investor\s*name|person)$/, "full_name"],
  [/^(title|job\s*title|designation|position|role)$/, "title"],
  [/^(company|company\s*name|organi[sz]ation|firm|fund|account|account\s*name)$/, "company_name"],
  [/^(industry|sector|vertical|focus)$/, "industry"],
  [/^(e-?mail|email\s*address|work\s*email|mail)$/, "email"],
  [/^(linkedin|linkedin\s*url|linkedin\s*profile|person\s*linkedin\s*url|profile\s*url)$/, "linkedin"],
  [/^(website|web\s*site|url|domain|company\s*website)$/, "website"],
  [/^(company\s*linkedin|company\s*linkedin\s*url|organi[sz]ation\s*linkedin)$/, "company_linkedin_url"],
  [/^(city|town|location\s*city)$/, "city"],
  [/^(country|nation|location\s*country)$/, "country"],
  [/^(quality|rating|score|lead\s*quality)$/, "quality"],
];

const MAX_ROWS = 20_000;
const CHUNK_SIZE = 500;

function guessTarget(header: string): TargetField {
  const normalized = header.trim().toLowerCase().replace(/[_.]+/g, " ").replace(/\s+/g, " ");
  return SYNONYMS.find(([pattern]) => pattern.test(normalized))?.[1] ?? "";
}

function buildLead(cells: string[], mapping: TargetField[]): Record<string, string> {
  const lead: Record<string, string> = {};
  mapping.forEach((target, index) => {
    const value = cells[index]?.trim();
    if (!target || !value) return;
    if (target === "full_name") {
      const parts = value.split(/\s+/);
      if (!lead.first_name) lead.first_name = parts[0];
      if (!lead.last_name && parts.length > 1) lead.last_name = parts.slice(1).join(" ");
    } else if (!lead[target]) {
      lead[target] = value;
    }
  });
  return lead;
}

type ImportHistoryRow = {
  id: string;
  company_id: string;
  user_email: string | null;
  file_name: string | null;
  total_rows: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  created_at: string;
};

export function UploadLeadsPage() {
  const user = useSession();
  const company = companyById(user.companyId);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<TargetField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Omit<LeadImportSummary, "id"> & { id: string | null } | null>(null);
  const [history, setHistory] = useState<ImportHistoryRow[]>([]);

  const loadHistory = useCallback(() => {
    fetch("/api/leads/import")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { data: ImportHistoryRow[] } | null) => data && setHistory(data.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function readFile(file: File) {
    setError(null);
    setResult(null);
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      setError("Please choose a .csv file. In Excel or Google Sheets use File → Download / Save as → CSV.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("That file is larger than 20 MB. Split it into smaller files.");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setError("The file needs a header row and at least one lead.");
      return;
    }
    const [headerRow, ...dataRows] = parsed;
    if (dataRows.length > MAX_ROWS) {
      setError(`The file has ${dataRows.length.toLocaleString()} rows. Upload at most ${MAX_ROWS.toLocaleString()} at a time.`);
      return;
    }
    setFileName(file.name);
    setHeaders(headerRow);
    setRows(dataRows);
    setMapping(headerRow.map(guessTarget));
  }

  const leads = useMemo(() => rows.map((cells) => buildLead(cells, mapping)), [rows, mapping]);
  const usableCount = useMemo(
    () => leads.filter((lead) => lead.first_name || lead.last_name || lead.company_name || lead.email).length,
    [leads]
  );
  const mappedFields = new Set(mapping.filter(Boolean));
  const hasIdentity = ["first_name", "last_name", "full_name", "company_name", "email"].some((field) =>
    mappedFields.has(field as TargetField)
  );

  async function upload() {
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: leads.length });
    const totals = { id: null as string | null, total: 0, inserted: 0, duplicates: 0, invalid: 0 };
    try {
      for (let start = 0; start < leads.length; start += CHUNK_SIZE) {
        const chunk = leads.slice(start, start + CHUNK_SIZE);
        const response = await fetch("/api/leads/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk, fileName, totalRows: leads.length, importId: totals.id }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "Upload failed");
        const summary = data as LeadImportSummary;
        totals.id = summary.id;
        totals.total += summary.total;
        totals.inserted += summary.inserted;
        totals.duplicates += summary.duplicates;
        totals.invalid += summary.invalid;
        setProgress({ done: Math.min(start + CHUNK_SIZE, leads.length), total: leads.length });
      }
      setResult(totals);
      setRows([]);
      setHeaders([]);
      setFileName(null);
      loadHistory();
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "Upload failed"}. ${totals.inserted.toLocaleString()} leads were added before the error.`);
      if (totals.inserted > 0) setResult(totals);
      loadHistory();
    } finally {
      setProgress(null);
    }
  }

  const preview = leads.slice(0, 5);
  const previewFields = EDITABLE_FIELDS.filter((field) => mappedFields.has(field.key) || (mappedFields.has("full_name") && (field.key === "first_name" || field.key === "last_name")));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <div className="mx-auto max-w-[1100px] space-y-6 px-6 py-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Upload leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            New leads are shared with every company and carry a{" "}
            <SourceWatermark companyId={user.companyId} /> watermark. Leads already in the database (same email or
            LinkedIn) are skipped, so nobody gets duplicates.
          </p>
        </div>

        {result && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
            <div className="font-semibold">Upload complete</div>
            <div className="mt-1">
              {result.inserted.toLocaleString()} new leads added · {result.duplicates.toLocaleString()} already existed ·{" "}
              {result.invalid.toLocaleString()} rows skipped (no name, company or email)
            </div>
            {result.inserted > 0 && (
              <Link href={`/?source=${user.companyId}`} className="mt-2 inline-block font-medium text-emerald-800 underline">
                View leads added by {company?.name} →
              </Link>
            )}
          </div>
        )}

        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">{error}</div>}

        {rows.length === 0 ? (
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) readFile(file);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
              isDragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-white hover:border-slate-400"
            }`}
          >
            <svg className="h-10 w-10 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            <div className="mt-3 text-sm font-semibold text-slate-800">Drop a CSV file here, or click to choose</div>
            <div className="mt-1 text-xs text-slate-500">
              Columns like Name, Email, Company, Title, LinkedIn, City, Country are matched automatically. Up to{" "}
              {MAX_ROWS.toLocaleString()} rows.
            </div>
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) readFile(file);
                event.target.value = "";
              }}
            />
          </label>
        ) : (
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Match columns</h2>
                  <p className="text-sm text-slate-500">
                    {fileName} · {rows.length.toLocaleString()} rows
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRows([]);
                    setHeaders([]);
                    setFileName(null);
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
                >
                  Choose another file
                </button>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {headers.map((header, index) => (
                  <label key={`${header}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <span className="w-2/5 truncate text-sm font-medium text-slate-700" title={header}>
                      {header || `Column ${index + 1}`}
                    </span>
                    <span className="text-slate-300">→</span>
                    <select
                      value={mapping[index] ?? ""}
                      onChange={(event) =>
                        setMapping((previous) => previous.map((value, i) => (i === index ? (event.target.value as TargetField) : value)))
                      }
                      className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm outline-none ${
                        mapping[index] ? "border-indigo-200 bg-white text-slate-900" : "border-slate-200 bg-white text-slate-400"
                      }`}
                    >
                      {TARGETS.map((target) => (
                        <option key={target.value || "skip"} value={target.value}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold">Preview</h2>
              {previewFields.length === 0 ? (
                <p className="text-sm text-slate-500">Match at least one column to see a preview.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        {previewFields.map((field) => (
                          <th key={field.key} className="px-3 py-2 font-semibold">
                            {field.label}
                          </th>
                        ))}
                        {mappedFields.has("quality") && <th className="px-3 py-2 font-semibold">Your quality</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.map((lead, index) => (
                        <tr key={index}>
                          {previewFields.map((field) => (
                            <td key={field.key} className="max-w-[200px] truncate px-3 py-2 text-slate-700">
                              {lead[field.key] || <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                          {mappedFields.has("quality") && <td className="px-3 py-2 text-slate-700">{lead.quality || "—"}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">
                  {usableCount.toLocaleString()} of {rows.length.toLocaleString()} rows have a name, company or email.
                </p>
                <button
                  type="button"
                  onClick={upload}
                  disabled={!hasIdentity || usableCount === 0 || progress !== null}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {progress ? "Uploading…" : `Upload ${usableCount.toLocaleString()} leads as ${company?.name}`}
                </button>
              </div>
              {progress && (
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${company?.accent ?? "bg-indigo-600"}`}
                      style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500">
                    {progress.done.toLocaleString()} / {progress.total.toLocaleString()} rows
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Upload history</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">No uploads yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">File</th>
                    <th className="px-3 py-2">By</th>
                    <th className="px-3 py-2 text-right">Added</th>
                    <th className="px-3 py-2 text-right">Duplicates</th>
                    <th className="px-3 py-2 text-right">Skipped</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(item.created_at)}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-slate-800">{item.file_name || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{item.user_email || companyName(item.company_id)}</td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-700">{item.inserted.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{item.duplicates.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{item.invalid.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
