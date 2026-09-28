"use client";

import { useState } from "react";
import type { AssignmentsResponse } from "../../../lib/adminTypes";
import { formatDateTime, fullName, investorCode } from "../../../lib/format";
import { ConfirmButton, INPUT, Notice, adminApi, personName } from "./shared";

/** What one person has: where it came from (batches) and every assigned investor, with removal. */
export function AssignedList({
  data,
  search,
  onSearchChange,
  onLoadMore,
  isLoading,
  onChanged,
}: {
  data: AssignmentsResponse;
  search: string;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
  isLoading: boolean;
  onChanged: (message: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = data.user;

  async function remove(body: Record<string, unknown>, describe: (removed: number) => string) {
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi<{ removed: number }>(`/api/admin/users/${user.id}/assignments`, { method: "DELETE", body });
      setSelected(new Set());
      onChanged(describe(result.removed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  const allShownSelected = data.data.length > 0 && data.data.every((row) => selected.has(String(row.id)));

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            {personName(user)}&apos;s investors ({data.total.toLocaleString()})
          </h3>
          {data.minId && data.maxId && (
            <p className="text-xs text-slate-500">
              Between <span className="font-mono">{investorCode(data.minId)}</span> and <span className="font-mono">{investorCode(data.maxId)}</span>
            </p>
          )}
        </div>
        {data.total > 0 && (
          <ConfirmButton
            label="Remove all"
            confirmLabel={`Yes, remove all ${data.total.toLocaleString()}`}
            disabled={busy}
            onConfirm={() => remove({ all: true }, (removed) => `Removed all ${removed.toLocaleString()} investors from ${personName(user)}.`)}
          />
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {data.batches.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">How they were assigned</div>
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {data.batches.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{batch.description}</div>
                  <div className="text-xs text-slate-500">
                    {batch.current_count.toLocaleString()} investors
                    {batch.current_count !== batch.added_count ? ` (added ${batch.added_count.toLocaleString()})` : ""} · {batch.created_by || "Admin"} ·{" "}
                    {formatDateTime(batch.created_at)}
                  </div>
                </div>
                <ConfirmButton
                  label="Undo"
                  confirmLabel="Yes, undo"
                  disabled={busy || batch.current_count === 0}
                  onConfirm={() => remove({ batchId: batch.id }, (removed) => `Removed ${removed.toLocaleString()} investors (${batch.description}).`)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search their investors (name, company, INV-ID)" className={`${INPUT} max-w-sm`} />
        {selected.size > 0 && (
          <ConfirmButton
            label={`Remove ${selected.size.toLocaleString()} selected`}
            confirmLabel="Yes, remove"
            disabled={busy}
            onConfirm={() => remove({ investorIds: Array.from(selected) }, (removed) => `Removed ${removed.toLocaleString()} investors from ${personName(user)}.`)}
          />
        )}
      </div>

      <div className="max-h-[480px] overflow-auto rounded-xl ring-1 ring-slate-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  checked={allShownSelected}
                  onChange={() =>
                    setSelected((previous) => {
                      const next = new Set(previous);
                      for (const row of data.data) {
                        if (allShownSelected) next.delete(String(row.id));
                        else next.add(String(row.id));
                      }
                      return next;
                    })
                  }
                  className="h-4 w-4 accent-indigo-600"
                />
              </th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Investor</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Assigned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.data.map((row) => {
              const id = String(row.id);
              return (
                <tr
                  key={id}
                  onClick={() =>
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  className={`cursor-pointer ${selected.has(id) ? "bg-rose-50/60" : "hover:bg-slate-50"}`}
                >
                  <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      aria-label={`Select ${investorCode(id)}`}
                      onChange={() =>
                        setSelected((previous) => {
                          const next = new Set(previous);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                      className="h-4 w-4 accent-indigo-600"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{investorCode(id)}</td>
                  <td className="px-3 py-2">
                    <div className="truncate font-medium text-slate-800">{fullName(row.first_name, row.last_name) || "—"}</div>
                    <div className="truncate text-xs text-slate-500">{[row.title, row.company_name].filter(Boolean).join(" · ") || "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{row.country || "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    <div className="truncate">{row.batch_description || "—"}</div>
                    <div>{formatDateTime(row.assigned_at)}</div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && data.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                  {search ? "No assigned investors match." : "Nothing assigned yet. Use the form above to assign investors."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {isLoading && <div className="p-3 text-center text-xs text-slate-400">Loading…</div>}
        {!isLoading && data.nextCursor && (
          <div className="border-t border-slate-100 p-2 text-center">
            <button type="button" onClick={onLoadMore} className="rounded-md px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50">
              Show more
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
