"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { companyById } from "../lib/companies";
import { initialsOf } from "../lib/format";
import type { EmailSetupStatus } from "../lib/types";
import { useSession } from "./SessionProvider";

const UNREAD_POLL_MS = 60_000;

function NavLink({ href, label, badge }: { href: string; label: string; badge?: number }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" || pathname.startsWith("/investors") : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {label}
      {badge ? (
        <span
          className={`min-w-5 rounded-full px-1.5 text-center text-xs font-semibold ${
            active ? "bg-white text-slate-900" : "bg-indigo-600 text-white"
          }`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Which company's workspace is open. Each account belongs to exactly one company. */
function WorkspaceBadge() {
  const user = useSession();
  const company = companyById(user.companyId);
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${company?.soft ?? ""}`}>
      {company?.name} workspace
    </span>
  );
}

function AccountMenu() {
  const user = useSession();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "name" | "password">("menu");
  const [name, setName] = useState(user.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function save(body: Record<string, string>, success: string) {
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Could not save");
      setMessage({ tone: "ok", text: success });
      setCurrentPassword("");
      setNewPassword("");
      // Re-read the session in the layout so the new name shows everywhere.
      if ("name" in body) router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setIsSaving(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  const display = user.name || user.email;
  const inputClass = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((open) => !open);
          setPanel("menu");
          setMessage(null);
        }}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm text-slate-700 transition-colors hover:bg-slate-50"
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white ${companyById(user.homeCompanyId)?.accent ?? "bg-slate-500"}`}>
          {initialsOf(display)}
        </span>
        <span className="max-w-40 truncate">{display}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/10">
          <div className="border-b border-slate-100 pb-2.5">
            <div className="truncate text-sm font-semibold text-slate-900">{user.name || "No name set"}</div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
            <div className="mt-1 text-xs text-slate-400">
              {companyById(user.homeCompanyId)?.name} · {user.role === "admin" ? "Admin" : "Member"}
            </div>
          </div>

          {panel === "menu" && (
            <div className="pt-2">
              {[
                { label: "Change display name", action: () => setPanel("name") },
                { label: "Change password", action: () => setPanel("password") },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className="flex w-full rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={signOut}
                className="flex w-full rounded-md px-2.5 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
              >
                Sign out
              </button>
            </div>
          )}

          {panel === "name" && (
            <form
              className="space-y-2 pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                save({ name }, "Name updated");
              }}
            >
              <input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Your name" className={inputClass} />
              <button type="submit" disabled={isSaving} className="w-full rounded-lg bg-slate-900 py-1.5 text-sm font-medium text-white disabled:opacity-60">
                Save name
              </button>
            </form>
          )}

          {panel === "password" && (
            <form
              className="space-y-2 pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                save({ currentPassword, newPassword }, "Password changed. Other devices were signed out.");
              }}
            >
              <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" className={inputClass} />
              <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (8+ characters)" className={inputClass} />
              <button type="submit" disabled={isSaving || !currentPassword || newPassword.length < 8} className="w-full rounded-lg bg-slate-900 py-1.5 text-sm font-medium text-white disabled:opacity-60">
                Change password
              </button>
            </form>
          )}

          {message && (
            <div className={`mt-2 rounded-md px-2.5 py-1.5 text-xs ${message.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {message.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Top bar shared by every signed-in page. */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  const user = useSession();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function load() {
      if (document.visibilityState === "hidden") return;
      fetch("/api/email/status")
        .then((res) => (res.ok ? res.json() : null))
        .then((status: EmailSetupStatus | null) => {
          if (!cancelled && status) setUnread(status.unread);
        })
        .catch(() => undefined);
    }
    load();
    const timer = setInterval(load, UNREAD_POLL_MS);
    window.addEventListener("mail:changed", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("mail:changed", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className={`h-1 ${companyById(user.companyId)?.accent ?? "bg-slate-900"}`} />
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex flex-wrap items-center gap-5">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
            Investor Database
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink href="/" label="Investors" />
            <NavLink href="/inbox" label="Inbox" badge={unread} />
            <NavLink href="/upload" label="Add leads" />
            {user.role === "admin" && <NavLink href="/admin" label="Admin" />}
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {children}
          <WorkspaceBadge />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/** Tell the header (and any listeners) that mail changed, e.g. after sending or syncing. */
export function notifyMailChanged() {
  window.dispatchEvent(new Event("mail:changed"));
}
