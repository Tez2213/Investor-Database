import { redirect } from "next/navigation";
import { LoginForm } from "../../components/auth/LoginForm";
import { getServerSession } from "../../lib/auth/session";

function safeNext(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getServerSession()) redirect(next);
  return <LoginForm next={next} />;
}
