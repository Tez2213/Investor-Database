"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect } from "react";
import type { SessionUser } from "../lib/auth/session";

const SessionContext = createContext<SessionUser | null>(null);

/**
 * Makes the signed-in user available to client components, and sends the
 * browser to the login page if any API call reports the session has ended
 * (expired, signed out elsewhere, or deactivated by an admin).
 */
export function SessionProvider({ user, children }: { user: SessionUser | null; children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
      // The admin portal has its own sign-in and handles its own 401s.
      const isAdminApi = url.includes("/api/admin/");
      if (response.status === 401 && url.includes("/api/") && !url.includes("/api/auth/login") && !isAdminApi) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        router.replace(`/login?next=${next}`);
        router.refresh();
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [user, router]);

  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** The signed-in user. Only call inside pages that require login. */
export function useSession(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSession() used outside a signed-in page");
  return user;
}

export function useOptionalSession(): SessionUser | null {
  return useContext(SessionContext);
}
