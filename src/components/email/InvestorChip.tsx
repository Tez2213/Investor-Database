import Link from "next/link";
import { investorCode } from "../../lib/format";

/** "INV-000003 · Name" link to the investor's page, used wherever an email mentions an investor. */
export function InvestorChip({ id, name }: { id: string | number; name?: string | null }) {
  return (
    <Link
      href={`/investors/${id}`}
      onClick={(event) => event.stopPropagation()}
      title="Open investor"
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-1 pr-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
    >
      <span className="rounded-full bg-white px-1.5 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200">
        {investorCode(id)}
      </span>
      <span className="truncate">{name || "Investor"}</span>
      <span aria-hidden>→</span>
    </Link>
  );
}
