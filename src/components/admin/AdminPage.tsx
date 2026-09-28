"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivityLog } from "./ActivityLog";
import { Overview } from "./Overview";
import { UsersPanel } from "./UsersPanel";
import { AssignmentsPanel } from "./assignments/AssignmentsPanel";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users & access" },
  { id: "assignments", label: "Assignments" },
  { id: "activity", label: "Activity log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Top bar of the admin portal, which has its own sign-in separate from the workspaces. */
function AdminHeader({ adminName }: { adminName: string }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setIsSigningOut(true);
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-indigo-200 ring-1 ring-indigo-400/30">
            Admin
          </span>
          <span className="text-base font-semibold tracking-tight">Investor Database · Admin portal</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="hidden text-slate-300 hover:text-white sm:inline">
            Investor portal ↗
          </Link>
          <span className="hidden text-slate-400 sm:inline">{adminName}</span>
          <button
            type="button"
            onClick={signOut}
            disabled={isSigningOut}
            className="rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/20 disabled:opacity-60"
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}

/** Admin portal: all three companies side by side, account management and the full audit trail. */
export function AdminPage({ adminName }: { adminName: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");

  // If the admin session ends (expired or signed out elsewhere), go back to the admin sign-in.
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
      if (response.status === 401 && url.includes("/api/admin/") && !url.includes("/api/admin/login")) {
        router.replace("/admin/login");
        router.refresh();
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [router]);
  const [activityFilter, setActivityFilter] = useState<{ userId?: string; company?: string }>({});
  const [assignmentUserId, setAssignmentUserId] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AdminHeader adminName={adminName} />
      <div className="mx-auto max-w-[1400px] animate-page-in px-6 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
            <p className="text-sm text-slate-500">Manage access and see everything happening across FabricVTON, BeatBand and Naaradh.</p>
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  tab === item.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "overview" && (
          <Overview
            onOpenActivity={(company) => {
              setActivityFilter({ company });
              setTab("activity");
            }}
          />
        )}
        {tab === "users" && (
          <UsersPanel
            onOpenActivity={(userId) => {
              setActivityFilter({ userId });
              setTab("activity");
            }}
            onOpenAssignments={(userId) => {
              setAssignmentUserId(userId);
              setTab("assignments");
            }}
          />
        )}
        {tab === "assignments" && <AssignmentsPanel key={assignmentUserId ?? "none"} initialUserId={assignmentUserId} />}
        {tab === "activity" && <ActivityLog key={JSON.stringify(activityFilter)} initialFilter={activityFilter} />}
      </div>
    </div>
  );
}
