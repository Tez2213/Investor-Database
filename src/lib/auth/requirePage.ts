import { redirect } from "next/navigation";
import { getServerSession, type Session } from "./session";

/** For page server components: the session, or a redirect to /login (or / for non-admins). */
export async function requirePageSession(path: string, options: { admin?: boolean } = {}): Promise<Session> {
  const session = await getServerSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (options.admin && session.role !== "admin") redirect("/");
  return session;
}
