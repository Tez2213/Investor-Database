"use client";

import { useEffect } from "react";
import type { Investor } from "../../lib/types";
import { fullName, initials, qualityBadgeClass } from "../../lib/format";

type InvestorDrawerProps = {
  investor: Investor | null;
  onClose: () => void;
};

type DetailRowProps = {
  label: string;
  children: React.ReactNode;
};

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="border-b border-slate-100 py-3.5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm text-slate-800">{children}</div>
    </div>
  );
}

function ensureHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function InvestorDrawer({ investor, onClose }: InvestorDrawerProps) {
  useEffect(() => {
    if (!investor) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [investor, onClose]);

  const isOpen = investor !== null;
  const name = investor ? fullName(investor.first_name, investor.last_name) : "";

  return (
    <div
      aria-hidden={!isOpen}
      className={`fixed inset-0 z-40 transition-[visibility] ${
        isOpen ? "visible" : "invisible"
      }`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className={`absolute right-0 top-0 h-full w-full max-w-md transform overflow-y-auto bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {investor && (
          <>
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                  {initials(investor.first_name, investor.last_name)}
                </div>
                <div>
                  <div className="text-base font-semibold text-slate-900">
                    {name || "—"}
                  </div>
                  {investor.title && (
                    <div className="text-sm text-slate-500">
                      {investor.title}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <div className="px-6 py-2">
              {investor.quality && (
                <div className="border-b border-slate-100 py-3.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${qualityBadgeClass(
                      investor.quality
                    )}`}
                  >
                    {investor.quality} quality
                  </span>
                </div>
              )}

              {investor.company_name && (
                <DetailRow label="Company">{investor.company_name}</DetailRow>
              )}

              {investor.industry && (
                <DetailRow label="Industry">{investor.industry}</DetailRow>
              )}

              {investor.email && (
                <DetailRow label="Email">
                  <a
                    href={`mailto:${investor.email}`}
                    className="text-indigo-600 hover:underline"
                  >
                    {investor.email}
                  </a>
                </DetailRow>
              )}

              {investor.linkedin && (
                <DetailRow label="LinkedIn">
                  <a
                    href={ensureHref(investor.linkedin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    View profile ↗
                  </a>
                </DetailRow>
              )}

              {investor.website && (
                <DetailRow label="Website">
                  <a
                    href={ensureHref(investor.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    {investor.website}
                  </a>
                </DetailRow>
              )}

              {investor.company_linkedin_url && (
                <DetailRow label="Company LinkedIn">
                  <a
                    href={ensureHref(investor.company_linkedin_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    View company page ↗
                  </a>
                </DetailRow>
              )}

              {(investor.city || investor.country) && (
                <DetailRow label="Location">
                  {[investor.city, investor.country].filter(Boolean).join(", ")}
                </DetailRow>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
