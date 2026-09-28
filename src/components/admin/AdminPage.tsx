"use client";

import { useState } from "react";
import { AppHeader } from "../AppHeader";
import { ActivityLog } from "./ActivityLog";
import { Overview } from "./Overview";
import { UsersPanel } from "./UsersPanel";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users & access" },
  { id: "activity", label: "Activity log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Admin portal: all three companies side by side, account management and the full audit trail. */
export function AdminPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [activityFilter, setActivityFilter] = useState<{ userId?: string; company?: string }>({});

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <div className="mx-auto max-w-[1400px] px-6 py-6">
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
          />
        )}
        {tab === "activity" && <ActivityLog key={JSON.stringify(activityFilter)} initialFilter={activityFilter} />}
      </div>
    </div>
  );
}
