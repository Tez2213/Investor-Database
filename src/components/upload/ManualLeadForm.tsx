"use client";

import Link from "next/link";
import { useState } from "react";
import { investorCode } from "../../lib/format";
import { EDITABLE_FIELDS, QUALITY_OPTIONS, type EditableInvestorField, type LeadImportSummary } from "../../lib/types";

type Values = Record<EditableInvestorField, string> & { quality: string };

const EMPTY: Values = {
  ...(Object.fromEntries(EDITABLE_FIELDS.map((field) => [field.key, ""])) as Record<EditableInvestorField, string>),
  quality: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PLACEHOLDERS: Partial<Record<EditableInvestorField, string>> = {
  first_name: "Priya",
  last_name: "Sharma",
  title: "Partner",
  company_name: "Sequoia Capital",
  industry: "Venture Capital",
  email: "priya@fund.com",
  linkedin: "linkedin.com/in/…",
  website: "fund.com",
  company_linkedin_url: "linkedin.com/company/…",
  city: "Bengaluru",
  country: "India",
};

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60";

type Outcome = { kind: "added" | "duplicate"; id: string | null; name: string };

/** Add a single lead by hand. It gets the same company watermark as a CSV upload. */
export function ManualLeadForm({ companyName, onAdded }: { companyName: string; onAdded: () => void }) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((previous) => ({ ...previous, [key]: event.target.value }));

  const hasIdentity = Boolean(values.first_name.trim() || values.last_name.trim() || values.company_name.trim() || values.email.trim());
  const emailInvalid = values.email.trim() !== "" && !EMAIL_PATTERN.test(values.email.trim());

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasIdentity || emailInvalid || isSaving) return;
    setIsSaving(true);
    setError(null);
    setOutcome(null);
    try {
      const row = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ""));
      const response = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [row], fileName: "Added manually", totalRows: 1 }),
      });
      const result: (LeadImportSummary & { error?: string }) | null = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(result?.error ?? "Could not add the lead");

      const name = [values.first_name, values.last_name].map((part) => part.trim()).filter(Boolean).join(" ") || values.company_name.trim() || values.email.trim();
      if (result.inserted > 0) {
        setOutcome({ kind: "added", id: result.insertedIds?.[0] ?? null, name });
        setValues(EMPTY);
        onAdded();
      } else if (result.duplicates > 0) {
        setOutcome({ kind: "duplicate", id: result.duplicateIds?.[0] ?? null, name });
      } else {
        setError("Add at least a name, company or email.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the lead");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="animate-fade-in space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold">Add a lead</h2>
        <p className="text-sm text-slate-500">
          Fill in what you know. A name, company or email is enough; everything else can be added later.
        </p>
      </div>

      {outcome && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${
            outcome.kind === "added" ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
          }`}
        >
          <span>
            {outcome.kind === "added" ? (
              <>
                <span className="font-semibold">{outcome.name}</span> was added
                {outcome.id && <span className="font-mono"> as {investorCode(outcome.id)}</span>}.
              </>
            ) : (
              <>
                <span className="font-semibold">{outcome.name}</span> is already in the database
                {outcome.id && <span className="font-mono"> as {investorCode(outcome.id)}</span>} (same email or LinkedIn), so
                nothing was added.
              </>
            )}
          </span>
          {outcome.id && (
            <Link href={`/investors/${outcome.id}`} className="font-semibold underline underline-offset-2">
              Open profile →
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {EDITABLE_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{field.label}</span>
            <input
              value={values[field.key]}
              onChange={set(field.key)}
              type={field.key === "email" ? "email" : "text"}
              inputMode={field.key === "email" ? "email" : field.key.includes("linkedin") || field.key === "website" ? "url" : undefined}
              autoComplete="off"
              maxLength={1000}
              placeholder={PLACEHOLDERS[field.key]}
              disabled={isSaving}
              className={`${INPUT_CLASS} ${field.key === "email" && emailInvalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : ""}`}
            />
            {field.key === "email" && emailInvalid && <span className="mt-1 block text-xs text-rose-600">This email doesn&apos;t look right</span>}
          </label>
        ))}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Your quality rating</span>
          <select value={values.quality} onChange={set("quality")} disabled={isSaving} className={INPUT_CLASS}>
            <option value="">Not rated</option>
            {QUALITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto text-xs text-slate-400">Duplicates (same email or LinkedIn) are detected automatically.</span>
        <button
          type="button"
          onClick={() => {
            setValues(EMPTY);
            setError(null);
            setOutcome(null);
          }}
          disabled={isSaving}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={!hasIdentity || emailInvalid || isSaving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {isSaving ? "Adding…" : `Add lead as ${companyName}`}
        </button>
      </div>
    </form>
  );
}
