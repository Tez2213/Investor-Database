"use client";

import { useState } from "react";
import { COMPANIES, companyForEmail } from "../../lib/companies";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const company = email.includes("@") ? companyForEmail(email) : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error ?? "Could not sign in");
        return;
      }
      // Full navigation so every page starts fresh with the new session.
      window.location.assign(next);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Investor Database</h1>
          <p className="mt-1.5 text-sm text-slate-500">Sign in with your company account</p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {COMPANIES.map((item) => (
              <span
                key={item.id}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-opacity ${item.soft} ${
                  company && company.id !== item.id ? "opacity-40" : ""
                }`}
              >
                {item.name}
              </span>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Work email</span>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@fabricvton.com"
              className={INPUT_CLASS}
            />
          </label>

          <label className="block">
            <span className="flex items-center justify-between text-sm font-medium text-slate-700">
              Password
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
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

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : company ? `Sign in to ${company.name}` : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-400">
          Don&apos;t have an account? Ask your admin to create one for you.
        </p>
      </div>
    </div>
  );
}
