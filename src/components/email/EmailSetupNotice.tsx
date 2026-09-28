"use client";

import { companyById } from "../../lib/companies";
import type { EmailSetupStatus } from "../../lib/types";
import { useSession } from "../SessionProvider";

/** Explains how to connect the company's mailbox when it isn't configured yet. */
export function EmailSetupNotice({ status }: { status: EmailSetupStatus | null }) {
  const user = useSession();
  if (!status || (status.smtpConfigured && status.imapConfigured)) return null;

  const company = companyById(user.companyId);
  const prefix = company?.id.toUpperCase() ?? "COMPANY";

  if (user.role !== "admin") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <div className="font-semibold">{company?.name}&apos;s mailbox isn&apos;t connected yet</div>
        <p className="mt-1 text-amber-800">Ask your admin to connect it. Sending and the inbox will start working right away.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
      <div className="font-semibold">Connect {company?.name}&apos;s mailbox to turn on sending and the inbox</div>
      <p className="mt-1 text-amber-800">
        Add these lines to <code className="font-mono">.env.local</code> (or your hosting environment variables) and
        restart the server. GoDaddy mail servers are used by default.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-white/70 px-4 py-3 font-mono text-xs leading-relaxed text-slate-800 ring-1 ring-amber-200">
{`${prefix}_MAIL_USER=hello@${company?.domain ?? "yourcompany.com"}
${prefix}_MAIL_PASS=your-mailbox-password
${prefix}_MAIL_FROM_NAME=${company?.name ?? "Company"}`}
      </pre>
    </div>
  );
}
