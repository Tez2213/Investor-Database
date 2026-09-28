"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminUserRow, AssignmentsResponse } from "../../../lib/adminTypes";
import { COMPANIES, companyById, companyName } from "../../../lib/companies";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { AssignedList } from "./AssignedList";
import { AssignForm } from "./AssignForm";
import { INPUT, Notice, adminApi, personName } from "./shared";

type Options = { countries: string[]; industries: string[] } | null;

function AccessBadge({ person }: { person: AdminUserRow }) {
  if (person.role === "admin") {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Admin · sees all</span>;
  }
  if (person.access_mode === "all") {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">All investors</span>;
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        person.assigned_count === 0 ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"
      }`}
    >
      Assigned · {person.assigned_count.toLocaleString()}
    </span>
  );
}

/** Choose between "sees every investor" and "only assigned investors". */
function AccessCard({
  data,
  onChanged,
}: {
  data: AssignmentsResponse;
  onChanged: (message: string, tone?: "ok" | "error") => void;
}) {
  const [busy, setBusy] = useState(false);
  const user = data.user;

  async function setMode(mode: "all" | "assigned") {
    if (mode === user.access_mode) return;
    setBusy(true);
    try {
      await adminApi(`/api/admin/users/${user.id}`, { method: "PATCH", body: { access_mode: mode } });
      onChanged(
        mode === "all"
          ? `${personName(user)} can now see every investor. Their assignments are kept for later.`
          : `${personName(user)} now only sees their ${data.total.toLocaleString()} assigned investors.`
      );
    } catch (err) {
      onChanged(err instanceof Error ? err.message : "Could not change access", "error");
    } finally {
      setBusy(false);
    }
  }

  const company = companyById(user.company_id);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-slate-900">{personName(user)}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${company?.soft ?? ""}`}>{company?.name}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{user.role}</span>
          </div>
          <div className="text-sm text-slate-500">{user.email}</div>
        </div>

        {user.role === "admin" ? (
          <div className="max-w-xs rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
            Admins always see every investor at {companyName(user.company_id)}. Assignments you add are kept and apply if you make them a member.
          </div>
        ) : (
          <div>
            <div className="mb-1 text-xs font-medium text-slate-500">What they can see</div>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm font-medium">
              {(
                [
                  { mode: "all", label: "All investors" },
                  { mode: "assigned", label: `Only assigned (${data.total.toLocaleString()})` },
                ] as const
              ).map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  disabled={busy}
                  onClick={() => setMode(option.mode)}
                  className={`rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60 ${
                    user.access_mode === option.mode ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {user.role === "member" && user.access_mode === "assigned" && data.total === 0 && (
        <div className="mt-4">
          <Notice tone="warn">{personName(user)} is limited to assigned investors but has none yet, so their portal is empty. Assign some below.</Notice>
        </div>
      )}
      {user.role === "member" && user.access_mode === "assigned" && data.total > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          They only see these {data.total.toLocaleString()} investors everywhere in the portal: the list, profiles, timeline, inbox, emails and stats.
          Sending to anyone else is blocked.
        </p>
      )}
    </section>
  );
}

function PersonView({
  person,
  people,
  options,
  onMessage,
  onUsersChanged,
}: {
  person: AdminUserRow;
  people: AdminUserRow[];
  options: Options;
  onMessage: (text: string, tone?: "ok" | "error") => void;
  onUsersChanged: () => void;
}) {
  const [data, setData] = useState<AssignmentsResponse | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const url = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (cursor) params.set("cursor", cursor);
      return `/api/admin/users/${person.id}/assignments?${params.toString()}`;
    },
    [person.id, debouncedSearch]
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the person or search changes
    setIsLoading(true);
    adminApi<AssignmentsResponse>(url())
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadError(null);
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [url, reloadKey]);

  async function loadMore() {
    if (!data?.nextCursor) return;
    setIsLoading(true);
    try {
      const more = await adminApi<AssignmentsResponse>(url(data.nextCursor));
      setData((current) => (current ? { ...more, data: [...current.data, ...more.data] } : more));
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not load more", "error");
    } finally {
      setIsLoading(false);
    }
  }

  const changed = (message: string, tone: "ok" | "error" = "ok") => {
    onMessage(message, tone);
    if (tone === "ok") {
      setReloadKey((key) => key + 1);
      onUsersChanged();
    }
  };

  if (loadError && !data) return <Notice tone="error">{loadError}</Notice>;
  if (!data) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-72 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      <AccessCard data={data} onChanged={changed} />
      <AssignForm target={data.user} people={people} options={options} onAssigned={(message) => changed(message)} />
      <AssignedList
        data={data}
        search={search}
        onSearchChange={setSearch}
        onLoadMore={loadMore}
        isLoading={isLoading}
        onChanged={(message) => changed(message)}
      />
    </div>
  );
}

/**
 * Admin portal tab for deciding which investors each person can work on, across
 * all three companies.
 */
export function AssignmentsPanel({ initialUserId }: { initialUserId?: string }) {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialUserId ?? null);
  const [filter, setFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [options, setOptions] = useState<Options>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const loadUsers = useCallback(() => {
    adminApi<{ data: AdminUserRow[] }>("/api/admin/users")
      .then((result) => setUsers(result.data))
      .catch((err: Error) => setMessage({ text: err.message, tone: "error" }));
  }, []);

  useEffect(() => {
    loadUsers();
    adminApi<{ countries: string[]; industries: string[] }>("/api/admin/investors/options")
      .then(setOptions)
      .catch(() => undefined);
  }, [loadUsers]);

  const visible = (users ?? []).filter((person) => {
    if (companyFilter && person.company_id !== companyFilter) return false;
    const term = filter.trim().toLowerCase();
    return !term || person.email.includes(term) || (person.name ?? "").toLowerCase().includes(term);
  });
  // Until someone is picked, open the first member (the people assignments matter for).
  const selected =
    users?.find((person) => person.id === selectedId) ?? visible.find((person) => person.role === "member") ?? visible[0] ?? null;

  return (
    <div className="space-y-4">
      {message && (
        <Notice tone={message.tone} onClose={() => setMessage(null)}>
          {message.text}
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="h-fit space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-20">
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a person" className={INPUT} />
          <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className={INPUT}>
            <option value="">All companies</option>
            {COMPANIES.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <ul className="max-h-[65vh] space-y-1 overflow-y-auto">
            {users === null &&
              Array.from({ length: 5 }).map((_, index) => <li key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}
            {visible.map((person) => {
              const company = companyById(person.company_id);
              const active = selected?.id === person.id;
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(person.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${active ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"} ${
                      person.is_active ? "" : "opacity-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${company?.accent ?? "bg-slate-300"}`} />
                      <span className="truncate text-sm font-medium text-slate-900">{personName(person)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 pl-4">
                      <span className="truncate text-xs text-slate-500">{company?.name}</span>
                      <AccessBadge person={person} />
                    </div>
                  </button>
                </li>
              );
            })}
            {users !== null && visible.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">No people found.</li>}
          </ul>
        </aside>

        <div className="min-w-0">
          {selected ? (
            <PersonView
              key={selected.id}
              person={selected}
              people={users ?? []}
              options={options}
              onMessage={(text, tone = "ok") => setMessage({ text, tone })}
              onUsersChanged={loadUsers}
            />
          ) : users !== null ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
              Add people in “Users &amp; access” first, then assign investors to them here.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
