"use client";

import { useState } from "react";
import type { Investor } from "../../lib/types";
import { investorCode } from "../../lib/format";

/** Shows the investor's permanent ID; clicking it copies the ID to the clipboard. */
export function InvestorIdBadge({ id }: { id: Investor["id"] }) {
  const [copied, setCopied] = useState(false);
  const code = investorCode(id);

  async function handleClick(event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context); the ID is still visible to copy by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Copy investor ID"
      className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
    >
      {copied ? "Copied!" : code}
    </button>
  );
}
