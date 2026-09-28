"use client";

import { useEffect, useState } from "react";
import {
  EDITABLE_FIELDS,
  QUALITY_OPTIONS,
  type EditableInvestorField,
  type FieldSource,
  type FilterOptions,
  type Investor,
} from "../../lib/types";
import {
  SOURCE_STYLES,
  fullName,
  initials,
  qualityBadgeClass,
  sourceHighlight,
  toHref,
} from "../../lib/format";

type InvestorDrawerProps = {
  investor: Investor | null;
  filterOptions: FilterOptions | null;
  onClose: () => void;
  onSaved: (investor: Investor) => void;
};

type Draft = Record<EditableInvestorField, string>;

const CUSTOM_QUALITY = "__custom__";

const SUGGESTION_LISTS: Partial<Record<EditableInvestorField, keyof FilterOptions>> = {
  country: "countries",
  industry: "industries",
};

function toDraft(investor: Investor): Draft {
  const draft = {} as Draft;
  for (const { key } of EDITABLE_FIELDS) {
    draft[key] = investor[key] ?? "";
  }
  return draft;
}

function isPresetQuality(value: string) {
  return (QUALITY_OPTIONS as readonly string[]).includes(value);
}

function SourceTag({ source }: { source: FieldSource | undefined }) {
  if (!source) return null;
  const style = SOURCE_STYLES[source];
  return (
    <span
      title={style.description}
      className="ml-2 inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-500 ring-1 ring-slate-200"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function DetailRow({
  label,
  source,
  children,
}: {
  label: string;
  source?: FieldSource;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 py-3.5">
      <div className="flex items-center text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
        <SourceTag source={source} />
      </div>
      <div className="mt-1 break-words text-sm text-slate-800">
        <span className={sourceHighlight(source)}>{children}</span>
      </div>
    </div>
  );
}

function LinkOrText({ value, label }: { value: string; label?: string }) {
  const href = toHref(value);
  if (!href) return <>{value}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-600 hover:underline"
    >
      {label ?? value}
    </a>
  );
}

export function InvestorDrawer({
  investor,
  filterOptions,
  onClose,
  onSaved,
}: InvestorDrawerProps) {
  useEffect(() => {
    if (!investor) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [investor]);

  const isOpen = investor !== null;

  return (
    <div
      aria-hidden={!isOpen}
      className={`fixed inset-0 z-40 transition-[visibility] ${
        isOpen ? "visible" : "invisible"
      }`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className={`absolute right-0 top-0 flex h-full w-full max-w-md transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {investor && (
          <DrawerContent
            key={investor.id}
            investor={investor}
            filterOptions={filterOptions}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  );
}

type DrawerContentProps = {
  investor: Investor;
  filterOptions: FilterOptions | null;
  onClose: () => void;
  onSaved: (investor: Investor) => void;
};

function DrawerContent({ investor, filterOptions, onClose, onSaved }: DrawerContentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(investor));
  const [customQuality, setCustomQuality] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sources = investor.field_sources ?? {};

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (isEditing) {
        if (!isSaving) setIsEditing(false);
      } else {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, isSaving, onClose]);

  function startEditing() {
    const nextDraft = toDraft(investor);
    setDraft(nextDraft);
    setCustomQuality(nextDraft.quality !== "" && !isPresetQuality(nextDraft.quality));
    setSaveError(null);
    setIsEditing(true);
  }

  function isChanged(key: EditableInvestorField) {
    return draft[key].trim() !== (investor[key] ?? "");
  }

  function setField(key: EditableInvestorField, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();

    const changes: Partial<Record<EditableInvestorField, string>> = {};
    for (const { key } of EDITABLE_FIELDS) {
      if (isChanged(key)) changes[key] = draft[key];
    }

    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/investors/${investor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error ?? `Save failed (status ${response.status})`);
      }

      onSaved(result.data as Investor);
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  function inputClass(key: EditableInvestorField) {
    const source: FieldSource | undefined = isChanged(key) ? "edited" : sources[key];
    const tone = source
      ? SOURCE_STYLES[source].input
      : "border-slate-200 bg-white";
    return `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60 ${tone}`;
  }

  function fieldSourceTag(key: EditableInvestorField) {
    return <SourceTag source={isChanged(key) ? "edited" : sources[key]} />;
  }

  const name = fullName(investor.first_name, investor.last_name);
  const nameSource = sources.first_name ?? sources.last_name;
  const locationSource = sources.city ?? sources.country;

  return (
    <>
      <div className="flex items-start justify-between border-b border-slate-100 bg-white px-6 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {initials(investor.first_name, investor.last_name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900">
              <span className={sourceHighlight(nameSource)}>{name || "—"}</span>
            </div>
            <div className="truncate text-sm text-slate-500">
              {isEditing ? "Editing investor" : investor.title || "—"}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!isEditing && (
            <button
              type="button"
              onClick={startEditing}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
              </svg>
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {EDITABLE_FIELDS.map(({ key, label }) => {
              const labelRow = (
                <span className="flex items-center text-xs font-medium uppercase tracking-wide text-slate-500">
                  {label}
                  {fieldSourceTag(key)}
                </span>
              );

              if (key === "quality") {
                return (
                  <div key={key}>
                    <label htmlFor="investor-edit-quality">{labelRow}</label>
                    <select
                      id="investor-edit-quality"
                      value={customQuality ? CUSTOM_QUALITY : draft.quality}
                      onChange={(event) => {
                        if (event.target.value === CUSTOM_QUALITY) {
                          setCustomQuality(true);
                          if (isPresetQuality(draft.quality)) setField("quality", "");
                        } else {
                          setCustomQuality(false);
                          setField("quality", event.target.value);
                        }
                      }}
                      disabled={isSaving}
                      className={inputClass("quality")}
                    >
                      <option value="">Not set</option>
                      {QUALITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                      <option value={CUSTOM_QUALITY}>Custom…</option>
                    </select>
                    {customQuality && (
                      <input
                        type="text"
                        autoFocus
                        placeholder="Type a custom quality"
                        value={draft.quality}
                        onChange={(event) => setField("quality", event.target.value)}
                        disabled={isSaving}
                        className={inputClass("quality")}
                      />
                    )}
                  </div>
                );
              }

              const listKey = SUGGESTION_LISTS[key];
              const suggestions = listKey ? filterOptions?.[listKey] ?? [] : [];
              const listId = listKey ? `investor-edit-${key}-options` : undefined;

              return (
                <label key={key} className="block">
                  {labelRow}
                  <input
                    type={key === "email" ? "email" : "text"}
                    value={draft[key]}
                    onChange={(event) => setField(key, event.target.value)}
                    list={listId}
                    disabled={isSaving}
                    className={inputClass(key)}
                  />
                  {listId && (
                    <datalist id={listId}>
                      {suggestions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  )}
                </label>
              );
            })}
          </div>

          <div className="border-t border-slate-100 bg-white px-6 py-4">
            {saveError && (
              <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {saveError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {investor.quality && (
            <div className="flex items-center border-b border-slate-100 py-3.5">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${qualityBadgeClass(
                  investor.quality
                )}`}
              >
                {investor.quality} quality
              </span>
              <SourceTag source={sources.quality} />
            </div>
          )}

          {investor.title && (
            <DetailRow label="Title" source={sources.title}>
              {investor.title}
            </DetailRow>
          )}

          {investor.company_name && (
            <DetailRow label="Company" source={sources.company_name}>
              {investor.company_name}
            </DetailRow>
          )}

          {investor.industry && (
            <DetailRow label="Industry" source={sources.industry}>
              {investor.industry}
            </DetailRow>
          )}

          {investor.email && (
            <DetailRow label="Email" source={sources.email}>
              <a href={`mailto:${investor.email}`} className="text-indigo-600 hover:underline">
                {investor.email}
              </a>
            </DetailRow>
          )}

          {investor.linkedin && (
            <DetailRow label="LinkedIn" source={sources.linkedin}>
              <LinkOrText value={investor.linkedin} label="View profile ↗" />
            </DetailRow>
          )}

          {investor.website && (
            <DetailRow label="Website" source={sources.website}>
              <LinkOrText value={investor.website} />
            </DetailRow>
          )}

          {investor.company_linkedin_url && (
            <DetailRow label="Company LinkedIn" source={sources.company_linkedin_url}>
              <LinkOrText value={investor.company_linkedin_url} label="View company page ↗" />
            </DetailRow>
          )}

          {(investor.city || investor.country) && (
            <DetailRow label="Location" source={locationSource}>
              {[investor.city, investor.country].filter(Boolean).join(", ")}
            </DetailRow>
          )}

          <p className="py-4 text-xs text-slate-400">
            Missing something? Click <span className="font-medium">Edit</span> to add
            or correct any field. Changes save to the database and show in blue.
          </p>
        </div>
      )}
    </>
  );
}
