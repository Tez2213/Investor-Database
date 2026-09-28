"use client";

import { useState } from "react";
import {
  EDITABLE_FIELDS,
  type EditableInvestorField,
  type FieldSource,
  type FilterOptions,
  type Investor,
} from "../../lib/types";
import { SOURCE_STYLES } from "../../lib/format";
import { SourceTag } from "./SourceTag";

type Draft = Record<EditableInvestorField, string>;

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

type InvestorEditFormProps = {
  investor: Investor;
  filterOptions: FilterOptions | null;
  onSaved: (investor: Investor) => void;
  onCancel: () => void;
  /** Scrolls the fields while keeping the Save bar pinned (drawer layout). */
  scrollable?: boolean;
};

/** Form for editing every investor field; saves only the changed ones. */
export function InvestorEditForm({
  investor,
  filterOptions,
  onSaved,
  onCancel,
  scrollable = false,
}: InvestorEditFormProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(investor));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sources = investor.field_sources ?? {};

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
      onCancel();
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
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  function inputClass(key: EditableInvestorField) {
    const source: FieldSource | undefined = isChanged(key) ? "edited" : sources[key];
    const tone = source ? SOURCE_STYLES[source].input : "border-slate-200 bg-white";
    return `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60 ${tone}`;
  }

  return (
    <form onSubmit={handleSave} className={scrollable ? "flex min-h-0 flex-1 flex-col" : ""}>
      <div className={scrollable ? "flex-1 space-y-4 overflow-y-auto px-6 py-5" : "space-y-4"}>
        {EDITABLE_FIELDS.map(({ key, label }) => {
          const labelRow = (
            <span className="flex items-center text-xs font-medium uppercase tracking-wide text-slate-500">
              {label}
              <SourceTag source={isChanged(key) ? "edited" : sources[key]} />
            </span>
          );

          const listKey = SUGGESTION_LISTS[key];
          const suggestions = listKey ? filterOptions?.[listKey] ?? [] : [];
          const listId = listKey ? `investor-edit-${investor.id}-${key}-options` : undefined;

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

      <div className={scrollable ? "border-t border-slate-100 bg-white px-6 py-4" : "mt-5"}>
        {saveError && (
          <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{saveError}</div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
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
  );
}
