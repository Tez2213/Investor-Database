"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminUserRow } from "../../lib/adminTypes";
import { COMPANIES, companyById, companyForEmail } from "../../lib/companies";
import { formatDateTime } from "../../lib/format";

const INPUT = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";

/** Readable random password, e.g. "kite-Mango-4821". */
function generatePassword(): string {
  const words = ["river", "maple", "comet", "tiger", "orbit", "lotus", "cedar", "pixel", "amber", "delta", "ember", "falcon"];
  const random = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;
  const word = (index: number) => words[random(words.length)].replace(/^./, (c) => (index === 1 ? c.toUpperCase() : c));
  return `${word(0)}-${word(1)}-${1000 + random(9000)}`;
}

async function patchUser(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? "Could not update user");
}

function AddUserForm({ onCreated }: { onCreated: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [password, setPassword] = useState(generatePassword);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const company = email.includes("@") ? companyForEmail(email) : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role, password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Could not create user");
      onCreated(`Created ${email}. Share this password with them privately: ${password}`);
      setEmail("");
      setName("");
      setRole("member");
      setPassword(generatePassword());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create user");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">Add a person</h2>
      <p className="mt-0.5 text-sm text-slate-500">They sign in with this email and password and land in their company&apos;s workspace.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr_0.8fr_1.2fr_auto]">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Work email</span>
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@beatband.in" className={`mt-1 ${INPUT}`} />
          <span className={`mt-1 block text-xs ${email.includes("@") && !company ? "text-rose-600" : "text-slate-400"}`}>
            {company ? `→ ${company.name} workspace` : email.includes("@") ? "Only company domains are allowed" : COMPANIES.map((item) => `@${item.domain}`).join(" · ")}
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" className={`mt-1 ${INPUT}`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value as "member" | "admin")} className={`mt-1 ${INPUT}`}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="block">
          <span className="flex items-center justify-between text-xs font-medium text-slate-500">
            Password
            <button type="button" onClick={() => setPassword(generatePassword())} className="text-indigo-600 hover:underline">
              Generate
            </button>
          </span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required className={`mt-1 font-mono ${INPUT}`} />
        </label>
        <div className="flex items-end pb-5">
          <button type="submit" disabled={isSaving || !company} className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {isSaving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
      {error && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
    </form>
  );
}

function UserRow({ user, isSelf, onChanged, onMessage, onOpenActivity }: {
  user: AdminUserRow;
  isSelf: boolean;
  onChanged: () => void;
  onMessage: (text: string, tone?: "ok" | "error") => void;
  onOpenActivity: (userId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const company = companyById(user.company_id);

  async function run(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await patchUser(user.id, body);
      onMessage(success);
      onChanged();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not update user", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={user.is_active ? "" : "bg-slate-50 text-slate-400"}>
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{user.name || "—"}</div>
        <div className="text-xs text-slate-500">{user.email}</div>
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${company?.soft ?? ""}`}>{company?.name}</span>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-semibold uppercase tracking-wide ${user.role === "admin" ? "text-indigo-700" : "text-slate-500"}`}>{user.role}</span>
      </td>
      <td className="px-4 py-3 text-xs">
        {user.is_active ? <span className="text-emerald-700">Active</span> : <span className="text-rose-600">Deactivated</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
        {user.last_seen_at ? formatDateTime(user.last_seen_at) : user.last_login_at ? formatDateTime(user.last_login_at) : "Never signed in"}
      </td>
      <td className="px-4 py-3 text-right text-xs">
        <button type="button" onClick={() => onOpenActivity(user.id)} className="font-medium text-indigo-600 hover:underline">
          {user.actions_7d} this week
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const password = generatePassword();
              run({ password }, `New password for ${user.email}: ${password} (share it privately; they were signed out)`);
            }}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Reset password
          </button>
          {!isSelf && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => run({ role: user.role === "admin" ? "member" : "admin" }, `${user.email} is now ${user.role === "admin" ? "a member" : "an admin"}`)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {user.role === "admin" ? "Make member" : "Make admin"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run({ is_active: !user.is_active }, user.is_active ? `${user.email} deactivated and signed out` : `${user.email} reactivated`)
                }
                className={`rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                  user.is_active ? "border border-rose-200 text-rose-600 hover:bg-rose-50" : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {user.is_active ? "Deactivate" : "Reactivate"}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export function UsersPanel({ onOpenActivity }: { onOpenActivity: (userId: string) => void }) {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [companyFilter, setCompanyFilter] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/users")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { data: AdminUserRow[] } | null) => data && setUsers(data.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showMessage = (text: string, tone: "ok" | "error" = "ok") => setMessage({ text, tone });
  const visible = (users ?? []).filter((user) => !companyFilter || user.company_id === companyFilter);

  return (
    <div className="space-y-5">
      <AddUserForm
        onCreated={(text) => {
          showMessage(text);
          load();
        }}
      />

      {message && (
        <div className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm ${message.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
          <span className="break-all">{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="shrink-0 font-medium opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold">People ({visible.length})</h2>
          <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
            <option value="">All companies</option>
            {COMPANIES.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Person</th>
                <th className="px-4 py-2.5">Company</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Last active</th>
                <th className="px-4 py-2.5 text-right">Activity</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users === null ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : (
                visible.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={false}
                    onChanged={load}
                    onMessage={showMessage}
                    onOpenActivity={onOpenActivity}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
