"use client";

import Link from "next/link";
import { useState } from "react";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20";

/** Sign-in for the admin portal (separate from employee logins). */
export function AdminLoginForm() {
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: adminId, password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error ?? "Could not sign in");
        return;
      }
      // Full navigation so the admin page loads with the new session.
      window.location.assign("/admin");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-sm animate-page-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30">
            <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Admin portal</h1>
          <p className="mt-1.5 text-sm text-slate-400">Restricted area. Sign in with the admin ID.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800/60 p-6 shadow-xl">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Admin ID</span>
            <input
              autoComplete="username"
              autoFocus
              required
              value={adminId}
              onChange={(event) => setAdminId(event.target.value)}
              placeholder="admin@…"
              className={INPUT_CLASS}
            />
          </label>

          <label className="block">
            <span className="flex items-center justify-between text-sm font-medium text-slate-300">
              Password
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="text-xs font-medium text-slate-400 hover:text-slate-200"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>

          {error && <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/30">{error}</div>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Open admin portal"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-300">
            ← Back to the investor portal
          </Link>
        </p>
      </div>
    </div>
  );
}
