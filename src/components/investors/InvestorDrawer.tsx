"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FieldSource, FilterOptions, Investor } from "../../lib/types";
import { fullName, initials, qualityBadgeClass, sourceHighlight, toHref } from "../../lib/format";
import { SourceWatermark, TeamScoreBadge } from "./Badges";
import { InvestorEditForm } from "./InvestorEditForm";
import { InvestorIdBadge } from "./InvestorIdBadge";
import { SourceTag } from "./SourceTag";

type InvestorDrawerProps = {
  investor: Investor | null;
  filterOptions: FilterOptions | null;
  onClose: () => void;
  onSaved: (investor: Investor) => void;
};

function DetailRow({
  label,
  source,
  children,
}: {
  label: string;
  source?: FieldSource;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 py-3.5">
      <div className="flex items-center text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
        <SourceTag source={source} />
      </div>
      <div className="mt-1 break-words text-sm text-slate-800">
        <span className={sourceHighlight(source)}>{children}</span>
      </div>
    </div>
  );
}

export function LinkOrText({ value, label }: { value: string; label?: string }) {
  const href = toHref(value);
  if (!href) return <>{value}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
      {label ?? value}
    </a>
  );
}

export function InvestorDrawer({ investor, filterOptions, onClose, onSaved }: InvestorDrawerProps) {
  useEffect(() => {
    if (!investor) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [investor]);

  const isOpen = investor !== null;

  return (
    <div
      aria-hidden={!isOpen}
      className={`fixed inset-0 z-40 transition-[visibility] ${isOpen ? "visible" : "invisible"}`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className={`absolute right-0 top-0 flex h-full w-full max-w-md transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {investor && (
          <DrawerContent
            key={investor.id}
            investor={investor}
            filterOptions={filterOptions}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  );
}

type DrawerContentProps = {
  investor: Investor;
  filterOptions: FilterOptions | null;
  onClose: () => void;
  onSaved: (investor: Investor) => void;
};

function DrawerContent({ investor, filterOptions, onClose, onSaved }: DrawerContentProps) {
  const [isEditing, setIsEditing] = useState(false);

  const sources = investor.field_sources ?? {};

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (isEditing) setIsEditing(false);
      else onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, onClose]);

  const name = fullName(investor.first_name, investor.last_name);
  const nameSource = sources.first_name ?? sources.last_name;
  const locationSource = sources.city ?? sources.country;

  return (
    <>
      <div className="flex items-start justify-between border-b border-slate-100 bg-white px-6 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {initials(investor.first_name, investor.last_name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900">
              <span className={sourceHighlight(nameSource)}>{name || "—"}</span>
            </div>
            <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
              <InvestorIdBadge id={investor.id} />
              <span className="truncate">{isEditing ? "Editing investor" : investor.title || "—"}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
              </svg>
              Edit
            </button>
          )}
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
      </div>

      {isEditing ? (
        <InvestorEditForm
          investor={investor}
          filterOptions={filterOptions}
          scrollable
          onCancel={() => setIsEditing(false)}
          onSaved={(updated) => {
            onSaved(updated);
            setIsEditing(false);
          }}
        />
      ) : (
        <>
          <div className="flex gap-2 border-b border-slate-100 px-6 py-3">
            <Link
              href={`/investors/${investor.id}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              Open full profile &amp; timeline
            </Link>
            {investor.email && (
              <Link
                href={`/investors/${investor.id}?compose=1`}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3 4a2 2 0 00-2 2v.01L10 12l9-5.99V6a2 2 0 00-2-2H3z" />
                  <path d="M18 8.118l-8 5.333-8-5.333V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                Send email
              </Link>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-2">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-3.5">
              {investor.quality ? (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${qualityBadgeClass(
                    investor.quality
                  )}`}
                >
                  Your quality: {investor.quality}
                </span>
              ) : (
                <span className="text-xs text-slate-400">Not rated by your team</span>
              )}
              <span className="text-xs text-slate-400">Team:</span>
              <TeamScoreBadge investor={investor} />
              <SourceWatermark companyId={investor.source_company_id} />
            </div>

            {investor.title && (
              <DetailRow label="Title" source={sources.title}>
                {investor.title}
              </DetailRow>
            )}

            {investor.company_name && (
              <DetailRow label="Company" source={sources.company_name}>
                {investor.company_name}
              </DetailRow>
            )}

            {investor.industry && (
              <DetailRow label="Industry" source={sources.industry}>
                {investor.industry}
              </DetailRow>
            )}

            {investor.email && (
              <DetailRow label="Email" source={sources.email}>
                <Link href={`/investors/${investor.id}?compose=1`} className="text-indigo-600 hover:underline">
                  {investor.email}
                </Link>
              </DetailRow>
            )}

            {investor.linkedin && (
              <DetailRow label="LinkedIn" source={sources.linkedin}>
                <LinkOrText value={investor.linkedin} label="View profile ↗" />
              </DetailRow>
            )}

            {investor.website && (
              <DetailRow label="Website" source={sources.website}>
                <LinkOrText value={investor.website} />
              </DetailRow>
            )}

            {investor.company_linkedin_url && (
              <DetailRow label="Company LinkedIn" source={sources.company_linkedin_url}>
                <LinkOrText value={investor.company_linkedin_url} label="View company page ↗" />
              </DetailRow>
            )}

            {(investor.city || investor.country) && (
              <DetailRow label="Location" source={locationSource}>
                {[investor.city, investor.country].filter(Boolean).join(", ")}
              </DetailRow>
            )}

            <p className="py-4 text-xs text-slate-400">
              Missing something? Click <span className="font-medium">Edit</span> to add or correct any
              field. Changes save to the database, show in blue, and appear on the investor&apos;s timeline.
            </p>
          </div>
        </>
      )}
    </>
  );
}
