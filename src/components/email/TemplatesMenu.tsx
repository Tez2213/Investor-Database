"use client";

import { useEffect, useRef, useState } from "react";
import type { EmailTemplate } from "../../lib/types";

// Shared across composers so reopening one shows templates instantly.
let cachedTemplates: EmailTemplate[] | null = null;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? `Request failed (status ${response.status})`);
  return result as T;
}

type TemplatesMenuProps = {
  /** Current composer text, for "Save as template". */
  subject: string;
  body: string;
  onUse: (template: EmailTemplate) => void;
  disabled?: boolean;
};

/** Your saved subjects and messages: insert one, save the current draft, or delete. */
export function TemplatesMenu({ subject, body, onUse, disabled }: TemplatesMenuProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(cachedTemplates);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    request<{ data: EmailTemplate[] }>("/api/email/templates")
      .then((result) => {
        cachedTemplates = result.data;
        if (!cancelled) setTemplates(result.data);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function update(next: EmailTemplate[]) {
    const sorted = [...next].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    cachedTemplates = sorted;
    setTemplates(sorted);
  }

  async function save(event: { preventDefault(): void; stopPropagation(): void }) {
    event.preventDefault();
    event.stopPropagation();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ data: EmailTemplate }>("/api/email/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, body }),
      });
      update([...(templates ?? []).filter((template) => template.id !== result.data.id), result.data]);
      setSaving(false);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the template");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await request(`/api/email/templates/${id}`, { method: "DELETE" });
      update((templates ?? []).filter((template) => template.id !== id));
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the template");
    } finally {
      setBusy(false);
    }
  }

  const term = filter.trim().toLowerCase();
  const visible = (templates ?? []).filter(
    (template) => !term || template.name.toLowerCase().includes(term) || template.body.toLowerCase().includes(term)
  );
  const nameTaken = (templates ?? []).some((template) => template.name.toLowerCase() === name.trim().toLowerCase());
  const canSave = Boolean(subject.trim() || body.trim());

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
          open ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M3 4.75A1.75 1.75 0 014.75 3h10.5A1.75 1.75 0 0117 4.75v10.5A1.75 1.75 0 0115.25 17H4.75A1.75 1.75 0 013 15.25V4.75zM6 6.5a.75.75 0 000 1.5h8a.75.75 0 000-1.5H6zm0 3a.75.75 0 000 1.5h8a.75.75 0 000-1.5H6zm0 3a.75.75 0 000 1.5h5a.75.75 0 000-1.5H6z" />
        </svg>
        Templates{templates && templates.length > 0 ? ` (${templates.length})` : ""}
      </button>

      {open && (
        <div className="animate-fade-in absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {templates && templates.length > 5 && (
            <input
              autoFocus
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && event.preventDefault()}
              placeholder="Find a template"
              className="mb-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
          )}

          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {templates === null && !error && <li className="h-10 animate-pulse rounded-lg bg-slate-100" />}
            {templates !== null && templates.length === 0 && (
              <li className="px-2 py-3 text-xs leading-relaxed text-slate-500">
                No templates yet. Write a message you send often, then save it here to reuse it with one click.
                Placeholders like {"{{first_name}}"} are filled in for each investor.
              </li>
            )}
            {visible.map((template) => (
              <li key={template.id} className="group flex items-start gap-1 rounded-lg hover:bg-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    onUse(template);
                    setOpen(false);
                  }}
                  className="min-w-0 flex-1 px-2 py-1.5 text-left"
                  title="Insert into the email"
                >
                  <div className="truncate text-sm font-medium text-slate-900">{template.name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {template.subject && <span className="text-slate-700">{template.subject} · </span>}
                    {template.body.replace(/\s+/g, " ").trim() || "(no message)"}
                  </div>
                </button>
                {confirmDelete === template.id ? (
                  <div className="flex shrink-0 items-center gap-1 py-1.5 pr-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(template.id)}
                      className="rounded-md bg-rose-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-md px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100">
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(template.id)}
                    className="shrink-0 rounded-md p-1.5 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100"
                    title="Delete template"
                    aria-label={`Delete ${template.name}`}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
            {templates !== null && templates.length > 0 && visible.length === 0 && (
              <li className="px-2 py-3 text-center text-xs text-slate-400">No matching templates.</li>
            )}
          </ul>

          {error && <div className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">{error}</div>}

          <div className="mt-2 border-t border-slate-100 pt-2">
            {saving ? (
              // Not a nested <form>: the composer itself is a form.
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") save(event);
                    }}
                    maxLength={80}
                    placeholder="Template name, e.g. First intro"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                  />
                  <button
                    type="button"
                    disabled={!name.trim() || busy}
                    onClick={save}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {busy ? "Saving…" : nameTaken ? "Replace" : "Save"}
                  </button>
                </div>
                <div className="px-0.5 text-[11px] text-slate-400">
                  {nameTaken ? "A template with this name exists and will be updated." : "Saves the current subject and message."}
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!canSave}
                onClick={() => {
                  setSaving(true);
                  setError(null);
                }}
                className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:text-slate-400 disabled:hover:bg-transparent"
                title={canSave ? undefined : "Write a subject or message first"}
              >
                + Save current email as a template
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
