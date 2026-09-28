"use client";

import { useState } from "react";

export const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400";

/** JSON request to an admin API; throws the server's error message on failure. */
export async function adminApi<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`);
  return data as T;
}

export function personName(user: { name: string | null; email: string }): string {
  return user.name?.trim() || user.email;
}

/** A button that asks "Are you sure?" inline before running a destructive action. */
export function ConfirmButton({
  label,
  confirmLabel = "Yes, remove",
  onConfirm,
  disabled,
  className = "",
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="text-slate-500">Sure?</span>
        <button
          type="button"
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
          className="rounded-md bg-rose-600 px-2 py-1 font-medium text-white hover:bg-rose-500"
        >
          {confirmLabel}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="rounded-md px-2 py-1 font-medium text-slate-500 hover:bg-slate-100">
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setAsking(true)}
      className={`rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 ${className}`}
    >
      {label}
    </button>
  );
}

export function Notice({ tone, children, onClose }: { tone: "ok" | "error" | "warn"; children: React.ReactNode; onClose?: () => void }) {
  const styles = {
    ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    error: "bg-rose-50 text-rose-700 ring-rose-200",
    warn: "bg-amber-50 text-amber-900 ring-amber-200",
  }[tone];
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm ring-1 ${styles}`}>
      <div className="min-w-0">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 text-xs font-medium opacity-70 hover:opacity-100">
          Dismiss
        </button>
      )}
    </div>
  );
}
