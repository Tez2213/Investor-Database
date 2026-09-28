"use client";

import { AppHeader } from "./AppHeader";
import { useOptionalSession } from "./SessionProvider";

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} />;
}

/**
 * Shown the instant a link is clicked while the next page loads (loading.tsx),
 * shaped like the page so the switch feels smooth instead of frozen.
 */
export function PageSkeleton({ variant }: { variant: "list" | "profile" | "inbox" | "simple" }) {
  // The root loading screen also covers /login, where nobody is signed in yet.
  const user = useOptionalSession();
  if (!user) return <div className="min-h-screen bg-slate-50" />;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <div className="mx-auto max-w-[1400px] animate-fade-in px-6 py-6">
        {variant === "list" && (
          <>
            <Block className="mb-6 h-28" />
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5">
              {Array.from({ length: 10 }).map((_, index) => (
                <Block key={index} className="h-10 rounded-lg" />
              ))}
            </div>
          </>
        )}

        {variant === "profile" && (
          <div className="mx-auto max-w-[1190px]">
            <Block className="mb-6 h-12 w-80" />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-5">
                <Block className="h-80" />
                <Block className="h-48" />
              </div>
              <div className="space-y-5">
                <Block className="h-72" />
                <Block className="h-40" />
              </div>
            </div>
          </div>
        )}

        {variant === "inbox" && (
          <>
            <Block className="mb-5 h-12 w-72" />
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Block key={index} className="h-24" />
              ))}
            </div>
            <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
              <Block className="h-56" />
              <Block className="h-96" />
            </div>
          </>
        )}

        {variant === "simple" && (
          <>
            <Block className="mb-5 h-12 w-72" />
            <Block className="h-96" />
          </>
        )}
      </div>
    </div>
  );
}
