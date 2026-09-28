"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminUserRow, AssignmentPreview, AssignmentsResponse, PickerInvestorRow } from "../../../lib/adminTypes";
import type { AssignmentCriteria } from "../../../lib/assignmentCriteria";
import { companyById, companyName } from "../../../lib/companies";
import { fullName, investorCode, parseInvestorCode } from "../../../lib/format";
import { CONTACTED_OPTIONS, QUALITY_OPTIONS, TEAM_SCORE_OPTIONS } from "../../../lib/types";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { INPUT, Notice, adminApi, personName } from "./shared";

type Target = AssignmentsResponse["user"];
type Options = { countries: string[]; industries: string[] } | null;
type Method = "rules" | "paste" | "pick" | "transfer";

const METHODS: { id: Method; label: string; hint: string }[] = [
  { id: "rules", label: "Range & filters", hint: "An ID range, filters, or both, e.g. INV-000001 – INV-000100 with LinkedIn" },
  { id: "paste", label: "Paste IDs", hint: "Paste IDs from a sheet: INV-000123, 124, #125 …" },
  { id: "pick", label: "Pick by hand", hint: "Search and tick investors one by one" },
  { id: "transfer", label: "Copy / move", hint: "Hand over another person's investors" },
];

const EMPTY_RULES: AssignmentCriteria = {
  idFrom: "",
  idTo: "",
  search: "",
  country: "",
  city: "",
  industry: "",
  title: "",
  source: "",
  quality: "",
  teamScore: "",
  hasEmail: "",
  hasLinkedIn: "",
  contacted: "",
  onlyUnassigned: false,
  limit: "",
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

/** Every condition an assignment can use; all of them combine (AND). */
function RuleFields({
  rules,
  onChange,
  options,
  target,
}: {
  rules: AssignmentCriteria;
  onChange: (next: AssignmentCriteria) => void;
  options: Options;
  target: Target;
}) {
  const set = (key: keyof AssignmentCriteria) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...rules, [key]: event.target.value });
  const company = companyName(target.company_id);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">ID range</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From ID">
            <input value={String(rules.idFrom ?? "")} onChange={set("idFrom")} placeholder="INV-000001" className={`${INPUT} font-mono`} />
          </Field>
          <Field label="To ID">
            <input value={String(rules.idTo ?? "")} onChange={set("idTo")} placeholder="INV-000100" className={`${INPUT} font-mono`} />
          </Field>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Filters (optional, combine as many as you like)</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="LinkedIn">
            <select value={rules.hasLinkedIn ?? ""} onChange={set("hasLinkedIn")} className={INPUT}>
              <option value="">Any</option>
              <option value="yes">Only with LinkedIn</option>
              <option value="no">Only without LinkedIn</option>
            </select>
          </Field>
          <Field label="Email">
            <select value={rules.hasEmail ?? ""} onChange={set("hasEmail")} className={INPUT}>
              <option value="">Any</option>
              <option value="yes">Only with email</option>
              <option value="no">Only without email</option>
            </select>
          </Field>
          <Field label="Country">
            <select value={rules.country ?? ""} onChange={set("country")} className={INPUT}>
              <option value="">Any country</option>
              {options?.countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Industry">
            <select value={rules.industry ?? ""} onChange={set("industry")} className={INPUT}>
              <option value="">Any industry</option>
              {options?.industries.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
          </Field>
          <Field label="City contains">
            <input value={rules.city ?? ""} onChange={set("city")} placeholder="e.g. Mumbai" className={INPUT} />
          </Field>
          <Field label="Title contains">
            <input value={rules.title ?? ""} onChange={set("title")} placeholder="e.g. Partner" className={INPUT} />
          </Field>
          <Field label="Name, company or email contains">
            <input value={rules.search ?? ""} onChange={set("search")} placeholder="e.g. Capital" className={INPUT} />
          </Field>
          <Field label="Source">
            <select value={rules.source ?? ""} onChange={set("source")} className={INPUT}>
              <option value="">Any source</option>
              <option value="original">Original database</option>
              <option value="uploaded">Uploaded by any company</option>
              <option value="fabricvton">Added by FabricVTON</option>
              <option value="beatband">Added by BeatBand</option>
              <option value="naaradh">Added by Naaradh</option>
            </select>
          </Field>
          <Field label={`${company}'s rating`}>
            <select value={rules.quality ?? ""} onChange={set("quality")} className={INPUT}>
              <option value="">Any rating</option>
              {QUALITY_OPTIONS.map((quality) => (
                <option key={quality} value={quality}>
                  {quality}
                </option>
              ))}
              <option value="unrated">Not rated yet</option>
            </select>
          </Field>
          <Field label="Team score (all companies)">
            <select value={rules.teamScore ?? ""} onChange={set("teamScore")} className={INPUT}>
              <option value="">Any score</option>
              {TEAM_SCORE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Emailed by ${company}`}>
            <select value={rules.contacted ?? ""} onChange={set("contacted")} className={INPUT}>
              <option value="">Any</option>
              {CONTACTED_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How many (optional)" hint="Takes the first N matches by ID">
            <input value={String(rules.limit ?? "")} onChange={set("limit")} inputMode="numeric" placeholder="All matches" className={INPUT} />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(rules.onlyUnassigned)}
            onChange={(event) => onChange({ ...rules, onlyUnassigned: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
          />
          Skip investors already assigned to someone else at {company}
        </label>
      </div>
    </div>
  );
}

function PreviewCard({ preview, target }: { preview: AssignmentPreview; target: Target }) {
  return (
    <div className="animate-fade-in space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">{preview.description}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[
          { label: "Match", value: preview.matched, tone: "text-slate-900" },
          { label: "Will be added", value: preview.toAdd, tone: "text-indigo-700" },
          { label: `Already ${personName(target)}'s`, value: preview.alreadyAssigned, tone: "text-slate-500" },
          { label: "Also with a teammate", value: preview.assignedToTeammates, tone: preview.assignedToTeammates ? "text-amber-700" : "text-slate-500" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-white px-2 py-2 ring-1 ring-slate-200">
            <div className={`text-lg font-semibold tabular-nums ${item.tone}`}>{item.value.toLocaleString()}</div>
            <div className="truncate text-[11px] text-slate-500">{item.label}</div>
          </div>
        ))}
      </div>
      {preview.minId && preview.maxId && (
        <div className="text-xs text-slate-500">
          Covers <span className="font-mono">{investorCode(preview.minId)}</span> to <span className="font-mono">{investorCode(preview.maxId)}</span>
        </div>
      )}
      {preview.notFound > 0 && (
        <div className="text-xs text-amber-700">{preview.notFound.toLocaleString()} of the IDs don&apos;t exist (or didn&apos;t match the filters) and will be skipped.</div>
      )}
      {preview.assignedToTeammates > 0 && (
        <div className="text-xs text-amber-700">
          {preview.assignedToTeammates.toLocaleString()} are also assigned to a teammate; both will be able to see them. Tick “Skip investors already
          assigned…” to avoid that.
        </div>
      )}
      {preview.sample.length > 0 && (
        <ul className="space-y-0.5 text-xs text-slate-600">
          {preview.sample.map((row) => (
            <li key={row.id} className="truncate">
              <span className="font-mono text-slate-400">{investorCode(row.id)}</span> {fullName(row.first_name, row.last_name) || "—"}
              {row.company_name ? ` · ${row.company_name}` : ""}
              {row.country ? ` · ${row.country}` : ""}
            </li>
          ))}
          {preview.matched > preview.sample.length && <li className="text-slate-400">…and {(preview.matched - preview.sample.length).toLocaleString()} more</li>}
        </ul>
      )}
    </div>
  );
}

/** Search investors and tick them; selections survive paging and new searches. */
function Picker({
  target,
  options,
  selected,
  onSelectedChange,
}: {
  target: Target;
  options: Options;
  selected: Map<string, string>;
  onSelectedChange: (next: Map<string, string>) => void;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [country, setCountry] = useState("");
  const [hasLinkedIn, setHasLinkedIn] = useState("");
  const [hasEmail, setHasEmail] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [rows, setRows] = useState<PickerInvestorRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ userId: target.id });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (country) params.set("country", country);
    if (hasLinkedIn) params.set("hasLinkedIn", hasLinkedIn);
    if (hasEmail) params.set("hasEmail", hasEmail);
    if (onlyUnassigned) params.set("onlyUnassigned", "1");
    return params.toString();
  }, [target.id, debouncedSearch, country, hasLinkedIn, hasEmail, onlyUnassigned]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the search changes
    setIsLoading(true);
    setError(null);
    adminApi<{ data: PickerInvestorRow[]; nextCursor: string | null }>(`/api/admin/investors?${query}`)
      .then((result) => {
        if (cancelled) return;
        setRows(result.data);
        setNextCursor(result.nextCursor);
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  async function loadMore() {
    if (!nextCursor) return;
    setIsLoading(true);
    try {
      const result = await adminApi<{ data: PickerInvestorRow[]; nextCursor: string | null }>(`/api/admin/investors?${query}&cursor=${nextCursor}`);
      setRows((previous) => [...previous, ...result.data]);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more");
    } finally {
      setIsLoading(false);
    }
  }

  const selectable = rows.filter((row) => !row.assigned_to_user);
  const allOnPageSelected = selectable.length > 0 && selectable.every((row) => selected.has(String(row.id)));

  function toggle(row: PickerInvestorRow) {
    const next = new Map(selected);
    const id = String(row.id);
    if (next.has(id)) next.delete(id);
    else next.set(id, fullName(row.first_name, row.last_name) || investorCode(id));
    onSelectedChange(next);
  }

  function toggleAll() {
    const next = new Map(selected);
    for (const row of selectable) {
      const id = String(row.id);
      if (allOnPageSelected) next.delete(id);
      else next.set(id, fullName(row.first_name, row.last_name) || investorCode(id));
    }
    onSelectedChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, company, email or INV-ID" className={INPUT} />
        <select value={country} onChange={(event) => setCountry(event.target.value)} className={INPUT}>
          <option value="">Any country</option>
          {options?.countries.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={hasLinkedIn} onChange={(event) => setHasLinkedIn(event.target.value)} className={INPUT}>
          <option value="">LinkedIn: any</option>
          <option value="yes">With LinkedIn</option>
          <option value="no">Without LinkedIn</option>
        </select>
        <select value={hasEmail} onChange={(event) => setHasEmail(event.target.value)} className={INPUT}>
          <option value="">Email: any</option>
          <option value="yes">With email</option>
          <option value="no">Without email</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={onlyUnassigned} onChange={(event) => setOnlyUnassigned(event.target.checked)} className="h-4 w-4 accent-indigo-600" />
        Hide investors already assigned to a teammate at {companyName(target.company_id)}
      </label>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="max-h-[420px] overflow-auto rounded-xl ring-1 ring-slate-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} aria-label="Select all shown" className="h-4 w-4 accent-indigo-600" />
              </th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Investor</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Already with</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const id = String(row.id);
              const mine = row.assigned_to_user;
              return (
                <tr
                  key={id}
                  onClick={() => !mine && toggle(row)}
                  className={`${mine ? "bg-slate-50 text-slate-400" : "cursor-pointer hover:bg-indigo-50/40"} ${selected.has(id) ? "bg-indigo-50/70" : ""}`}
                >
                  <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={mine || selected.has(id)}
                      disabled={mine}
                      onChange={() => toggle(row)}
                      aria-label={`Select ${investorCode(id)}`}
                      className="h-4 w-4 accent-indigo-600"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{investorCode(id)}</td>
                  <td className="px-3 py-2">
                    <div className="truncate font-medium text-slate-800">{fullName(row.first_name, row.last_name) || "—"}</div>
                    <div className="truncate text-xs text-slate-500">{[row.title, row.company_name].filter(Boolean).join(" · ") || "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{row.country || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {mine && <span className="mr-1 rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">Already theirs</span>}
                    {row.other_assignees.slice(0, 3).map((person) => (
                      <span key={person.name} className={`mr-1 inline-block rounded-full px-2 py-0.5 ring-1 ring-inset ${companyById(person.company_id)?.soft ?? ""}`}>
                        {person.name}
                      </span>
                    ))}
                    {row.other_assignees.length > 3 && <span className="text-slate-400">+{row.other_assignees.length - 3}</span>}
                  </td>
                </tr>
              );
            })}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  No investors match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {isLoading && <div className="p-3 text-center text-xs text-slate-400">Loading…</div>}
        {!isLoading && nextCursor && (
          <div className="border-t border-slate-100 p-2 text-center">
            <button type="button" onClick={loadMore} className="rounded-md px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50">
              Show more
            </button>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-medium">{selected.size.toLocaleString()} selected</span>
          <button type="button" onClick={() => onSelectedChange(new Map())} className="text-slate-500 underline hover:text-slate-700">
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}

function parsePastedIds(text: string): { ids: string[]; invalid: string[] } {
  const tokens = text.split(/[\s,;|]+/).map((token) => token.trim()).filter(Boolean);
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    const id = parseInvestorCode(token);
    if (id !== null && id > 0) ids.push(String(id));
    else invalid.push(token);
  }
  return { ids: Array.from(new Set(ids)), invalid };
}

function TransferForm({
  target,
  people,
  onDone,
}: {
  target: Target;
  people: AdminUserRow[];
  onDone: (message: string) => void;
}) {
  const others = people.filter((person) => person.id !== target.id);
  const [direction, setDirection] = useState<"give" | "take">("take");
  const [otherId, setOtherId] = useState("");
  const [mode, setMode] = useState<"copy" | "move">("copy");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const other = others.find((person) => person.id === otherId);

  async function run() {
    if (!other) return;
    setIsSaving(true);
    setError(null);
    const from = direction === "take" ? other.id : target.id;
    const to = direction === "take" ? target.id : other.id;
    try {
      const result = await adminApi<{ added: number; removed: number }>(`/api/admin/users/${from}/assignments/transfer`, {
        method: "POST",
        body: { toUserId: to, mode },
      });
      onDone(
        `${mode === "move" ? "Moved" : "Copied"} ${result.added.toLocaleString()} investors ${
          direction === "take" ? `from ${personName(other)} to ${personName(target)}` : `from ${personName(target)} to ${personName(other)}`
        }.`
      );
      setOtherId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Direction">
          <select value={direction} onChange={(event) => setDirection(event.target.value as "give" | "take")} className={INPUT}>
            <option value="take">Take investors from…</option>
            <option value="give">Give {personName(target)}&apos;s investors to…</option>
          </select>
        </Field>
        <Field label="Person">
          <select value={otherId} onChange={(event) => setOtherId(event.target.value)} className={INPUT}>
            <option value="">Choose a person</option>
            {others.map((person) => (
              <option key={person.id} value={person.id}>
                {personName(person)} · {companyName(person.company_id)} ({person.assigned_count.toLocaleString()} assigned)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Copy or move">
          <select value={mode} onChange={(event) => setMode(event.target.value as "copy" | "move")} className={INPUT}>
            <option value="copy">Copy (both keep them)</option>
            <option value="move">Move (the giver loses them)</option>
          </select>
        </Field>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <button
        type="button"
        disabled={!other || isSaving}
        onClick={run}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isSaving ? "Working…" : other ? `${mode === "move" ? "Move" : "Copy"} ${direction === "take" ? `${personName(other)}'s investors here` : `to ${personName(other)}`}` : "Choose a person"}
      </button>
    </div>
  );
}

/** Everything needed to add investors to one person, with a preview before anything changes. */
export function AssignForm({
  target,
  people,
  options,
  onAssigned,
}: {
  target: Target;
  people: AdminUserRow[];
  options: Options;
  onAssigned: (message: string) => void;
}) {
  const [method, setMethod] = useState<Method>("rules");
  const [rules, setRules] = useState<AssignmentCriteria>(EMPTY_RULES);
  const [pasted, setPasted] = useState("");
  const [picked, setPicked] = useState<Map<string, string>>(() => new Map());
  const [limitAccess, setLimitAccess] = useState(true);
  const [preview, setPreview] = useState<{ key: string; result: AssignmentPreview } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pastedIds = useMemo(() => parsePastedIds(pasted), [pasted]);

  const criteria: AssignmentCriteria | null =
    method === "rules" ? rules : method === "paste" ? (pastedIds.ids.length ? { ids: pastedIds.ids } : null) : method === "pick" ? (picked.size ? { ids: Array.from(picked.keys()) } : null) : null;
  const criteriaKey = JSON.stringify([method, criteria]);
  // A preview only counts for exactly the criteria it was made from.
  const currentPreview = preview && preview.key === criteriaKey ? preview.result : null;
  const canOfferLimit = target.role === "member" && target.access_mode === "all";

  async function runPreview() {
    if (!criteria) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await adminApi<AssignmentPreview>(`/api/admin/users/${target.id}/assignments`, {
        method: "POST",
        body: { criteria, preview: true },
      });
      setPreview({ key: criteriaKey, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function assign() {
    if (!criteria || !currentPreview) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await adminApi<{ added: number; accessMode: string; description: string }>(`/api/admin/users/${target.id}/assignments`, {
        method: "POST",
        body: { criteria, limitAccess: canOfferLimit && limitAccess },
      });
      const limited = canOfferLimit && limitAccess ? ` ${personName(target)} now only sees assigned investors.` : "";
      onAssigned(
        result.added > 0
          ? `Assigned ${result.added.toLocaleString()} investors to ${personName(target)} (${result.description}).${limited}`
          : `Nothing new to assign: ${personName(target)} already has all of those.${limited}`
      );
      setPreview(null);
      if (method === "paste") setPasted("");
      if (method === "pick") setPicked(new Map());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assigning failed");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Assign investors to {personName(target)}</h3>
        <div className="flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm font-medium">
          {METHODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMethod(item.id);
                setError(null);
              }}
              className={`rounded-lg px-3 py-1.5 transition-colors ${method === item.id ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-sm text-slate-500">{METHODS.find((item) => item.id === method)?.hint}</p>

      {method === "rules" && <RuleFields rules={rules} onChange={setRules} options={options} target={target} />}

      {method === "paste" && (
        <div className="space-y-2">
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={6}
            placeholder={"INV-000001\nINV-000002, INV-000010\n25 26 27"}
            className={`${INPUT} font-mono`}
          />
          <div className="text-xs text-slate-500">
            {pastedIds.ids.length.toLocaleString()} IDs found
            {pastedIds.invalid.length > 0 && (
              <span className="text-amber-700">
                {" "}
                · {pastedIds.invalid.length} not understood ({pastedIds.invalid.slice(0, 3).join(", ")}
                {pastedIds.invalid.length > 3 ? "…" : ""})
              </span>
            )}
          </div>
        </div>
      )}

      {method === "pick" && <Picker target={target} options={options} selected={picked} onSelectedChange={setPicked} />}

      {method === "transfer" && <TransferForm target={target} people={people} onDone={onAssigned} />}

      {method !== "transfer" && (
        <div className="mt-5 space-y-3">
          {error && <Notice tone="error">{error}</Notice>}
          {currentPreview && <PreviewCard preview={currentPreview} target={target} />}

          {currentPreview && canOfferLimit && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={limitAccess} onChange={(event) => setLimitAccess(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
              <span>
                Also limit {personName(target)} to assigned investors only
                <span className="block text-xs text-slate-400">Right now they can see every investor, so assigning alone changes nothing for them.</span>
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runPreview}
              disabled={!criteria || isBusy}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isBusy && !currentPreview ? "Checking…" : currentPreview ? "Preview again" : "Preview"}
            </button>
            <button
              type="button"
              onClick={assign}
              disabled={!currentPreview || isBusy || (currentPreview.toAdd === 0 && !(canOfferLimit && limitAccess))}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isBusy && currentPreview
                ? "Assigning…"
                : currentPreview
                  ? `Assign ${currentPreview.toAdd.toLocaleString()} investor${currentPreview.toAdd === 1 ? "" : "s"}`
                  : "Assign"}
            </button>
            {!currentPreview && criteria && <span className="text-xs text-slate-400">Preview first to see exactly who will be assigned.</span>}
            {!criteria && method !== "rules" && <span className="text-xs text-slate-400">{method === "paste" ? "Paste some IDs first." : "Tick some investors first."}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
