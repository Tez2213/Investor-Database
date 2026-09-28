"use client";

import { useState } from "react";
import type { InvestorProfile } from "../../lib/types";

export function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PencilButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
      </svg>
    </button>
  );
}

async function saveProfile(
  investorId: string | number,
  changes: { notes?: string | null; tags?: string[] }
): Promise<InvestorProfile> {
  const response = await fetch(`/api/investors/${investorId}/company`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? "Could not save");
  return result.data as InvestorProfile;
}

type SavedHandler = (profile: InvestorProfile) => void;

export function NotesCard({
  investorId,
  notes,
  onSaved,
}: {
  investorId: string | number;
  notes: string | null;
  onSaved: SavedHandler;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      onSaved(await saveProfile(investorId, { notes: draft }));
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card
      title="Notes"
      action={
        !isEditing && (
          <PencilButton
            label="Edit notes"
            onClick={() => {
              setDraft(notes ?? "");
              setIsEditing(true);
            }}
          />
        )
      }
    >
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
            maxLength={10000}
            placeholder="Anything the team should know: warm intro, ticket size, last conversation…"
            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : notes ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{notes}</p>
      ) : (
        <p className="text-sm text-slate-400">No notes</p>
      )}
    </Card>
  );
}

export function TagsCard({
  investorId,
  tags,
  onSaved,
}: {
  investorId: string | number;
  tags: string[];
  onSaved: SavedHandler;
}) {
  const [input, setInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string[]) {
    setIsSaving(true);
    setError(null);
    try {
      onSaved(await saveProfile(investorId, { tags: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setIsSaving(false);
    }
  }

  function addFromInput() {
    const additions = input
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag) => !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()));
    setInput("");
    if (additions.length > 0) save([...tags, ...additions]);
  }

  return (
    <Card title="Tags">
      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-violet-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-violet-700 ring-1 ring-violet-200"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                disabled={isSaving}
                onClick={() => save(tags.filter((existing) => existing !== tag))}
                className="flex h-4 w-4 items-center justify-center rounded-full text-violet-400 hover:bg-violet-100 hover:text-violet-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addFromInput();
          }
        }}
        onBlur={() => input.trim() && addFromInput()}
        disabled={isSaving}
        maxLength={200}
        placeholder="Add a tag, e.g. Warm lead, Follow up, Seed"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
      />
      {error && <div className="mt-1.5 text-xs text-rose-600">{error}</div>}
    </Card>
  );
}
