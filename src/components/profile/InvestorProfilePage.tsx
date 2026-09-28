"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActivitiesResponse,
  Activity,
  EmailMessage,
  EmailSetupStatus,
  FilterOptions,
  Investor,
  InvestorProfile,
  InvestorProfileResponse,
} from "../../lib/types";
import { COMPANIES, companyName } from "../../lib/companies";
import { updateCachedInvestor } from "../../lib/investorListCache";
import { followInSideWindow, openInSideWindow } from "../../lib/sideWindow";
import {
  dayLabel,
  formatDateTime,
  fullName,
  initials,
  qualityBadgeClass,
  sourceHighlight,
  toHref,
} from "../../lib/format";
import { AppHeader, notifyMailChanged } from "../AppHeader";
import { useSession } from "../SessionProvider";
import { EmailComposer } from "../email/EmailComposer";
import { EmailSetupNotice } from "../email/EmailSetupNotice";
import { EmailViewer } from "../email/EmailViewer";
import { buildReplyDefaults, type ComposerDefaults } from "../email/replyDefaults";
import { SourceWatermark, TeamScoreBadge } from "../investors/Badges";
import { InvestorEditForm } from "../investors/InvestorEditForm";
import { InvestorIdBadge } from "../investors/InvestorIdBadge";
import { QualitySelect } from "../investors/QualitySelect";
import { SourceTag } from "../investors/SourceTag";
import { Card, NotesCard, PencilButton, TagsCard } from "./ProfileCards";
import { Timeline } from "./Timeline";

function NavArrow({ href, direction }: { href: string | null; direction: "up" | "down" }) {
  const icon = (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d={
          direction === "up"
            ? "M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z"
            : "M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        }
        clipRule="evenodd"
      />
    </svg>
  );
  const className = "flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600";
  if (!href) return <span className={`${className} opacity-40`}>{icon}</span>;
  return (
    <Link href={href} title={direction === "up" ? "Previous investor" : "Next investor"} className={`${className} hover:bg-slate-50`}>
      {icon}
    </Link>
  );
}

function InfoRow({ label, source, children }: { label: string; source?: "predicted" | "edited"; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="flex items-center text-xs font-medium text-slate-400">
        {label}
        <SourceTag source={source} />
      </div>
      <div className="mt-0.5 break-words text-sm text-slate-800">
        <span className={sourceHighlight(source)}>{children}</span>
      </div>
    </div>
  );
}

/** How often the page checks the mailbox for replies while it is open. */
const MAIL_CHECK_MS = 60_000;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // Clipboard unavailable; the value is visible to copy by hand.
        }
      }}
      className="ml-2 shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function LinkedInIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  );
}

function newEmailDefaults(investor: Investor): ComposerDefaults {
  return { to: investor.email ? [investor.email] : [], subject: "", body: "Hi {{first_name}},\n\n" };
}

function ExternalLink({ value, label }: { value: string; label: string }) {
  const href = toHref(value);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
      {label}
    </a>
  ) : (
    <>{value}</>
  );
}

export function InvestorProfilePage({ id, initialCompose }: { id: string; initialCompose: boolean }) {
  const user = useSession();
  const [profile, setProfile] = useState<InvestorProfileResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [setup, setSetup] = useState<EmailSetupStatus | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  // The composer is always on the page; defaults null means "new email to this investor".
  const [composer, setComposer] = useState<{ key: number; defaults: ComposerDefaults | null; title: string }>({
    key: 0,
    defaults: null,
    title: "New email",
  });
  const [viewingEmailId, setViewingEmailId] = useState<string | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  const loadProfile = useCallback(async () => {
    const response = await fetch(`/api/investors/${id}`);
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? "Could not load this investor");
    const data = result as InvestorProfileResponse;
    setProfile(data);
    return data;
  }, [id]);

  const loadActivities = useCallback(
    async (cursor: string | null) => {
      setActivitiesLoading(true);
      try {
        const response = await fetch(
          `/api/investors/${id}/activities${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
        );
        if (!response.ok) return;
        const result: ActivitiesResponse = await response.json();
        setActivities((previous) => (cursor ? [...previous, ...result.data] : result.data));
        setNextCursor(result.nextCursor);
      } finally {
        setActivitiesLoading(false);
      }
    },
    [id]
  );

  const refresh = useCallback(() => {
    loadProfile().catch(() => undefined);
    loadActivities(null);
  }, [loadProfile, loadActivities]);

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      const section = document.getElementById("composer");
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      section?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    });
  }, []);

  /** Loads a reply (or a fresh email) into the composer and brings it into view. */
  const openComposer = useCallback(
    (defaults: ComposerDefaults | null, title = "New email") => {
      setComposer({ key: Date.now(), defaults, title });
      focusComposer();
    },
    [focusComposer]
  );

  const [popupBlocked, setPopupBlocked] = useState(false);
  const linkedinUrl = toHref(profile?.data.linkedin ?? null);

  const showLinkedIn = useCallback(() => {
    if (!linkedinUrl) return;
    setPopupBlocked(!openInSideWindow(linkedinUrl));
  }, [linkedinUrl]);

  // If the LinkedIn window is already open, move it to this investor's profile.
  useEffect(() => {
    if (linkedinUrl) followInSideWindow(linkedinUrl);
  }, [linkedinUrl]);

  const resetComposer = useCallback(() => setComposer({ key: Date.now(), defaults: null, title: "New email" }), []);

  // Keep the investor list (restored when going back) in step with edits made here.
  useEffect(() => {
    if (profile?.data) updateCachedInvestor(profile.data);
  }, [profile?.data]);

  useEffect(() => {
    let cancelled = false;

    // Initial data fetch for this investor (react.dev/learn/synchronizing-with-effects#fetching-data).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile()
      .then((data) => {
        if (!cancelled && initialCompose && data.data.email) focusComposer();
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    loadActivities(null);

    fetch("/api/investors/filters")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FilterOptions | null) => !cancelled && data && setFilterOptions(data))
      .catch(() => undefined);

    // Pull new mail in the background (now and every minute while the tab is
    // visible), so an investor's reply shows up on the timeline by itself.
    let canSync = false;
    async function checkMail() {
      if (!canSync || document.visibilityState !== "visible") return;
      const sync = await fetch("/api/email/sync", { method: "POST" })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
      if (!cancelled && sync?.imported > 0) {
        notifyMailChanged();
        loadActivities(null);
        loadProfile().catch(() => undefined);
      }
    }
    fetch("/api/email/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((status: EmailSetupStatus | null) => {
        if (cancelled || !status) return;
        setSetup(status);
        canSync = status.imapConfigured;
        checkMail();
      })
      .catch(() => undefined);
    const timer = setInterval(checkMail, MAIL_CHECK_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [initialCompose, focusComposer, loadActivities, loadProfile]);

  const investor = profile?.data;

  const handleQualityChange = useCallback(
    async (target: Investor, quality: string | null) => {
      const response = await fetch(`/api/investors/${target.id}/company`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quality }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        showNotice(result?.error ?? "Could not save the rating");
        return;
      }
      setProfile((current) => (current ? { ...current, data: result.data as InvestorProfile } : current));
      loadActivities(null);
    },
    [loadActivities, showNotice]
  );

  const handleCompanyDataSaved = useCallback(
    (updated: InvestorProfile) => {
      setProfile((current) => (current ? { ...current, data: updated } : current));
      loadActivities(null);
    },
    [loadActivities]
  );

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <div className="text-lg font-semibold text-slate-900">{loadError}</div>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline">
            ← Back to investors
          </Link>
        </div>
      </div>
    );
  }

  const name = investor ? fullName(investor.first_name, investor.last_name) : "";
  const sources = investor?.field_sources ?? {};
  const stats = profile?.stats;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />

      {notice && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {notice}
        </div>
      )}

      <div className="mx-auto max-w-[1240px] animate-page-in px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Link href="/" title="Back to investors" className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/60">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
            </Link>
            {investor ? (
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="truncate text-xl font-semibold tracking-tight">
                    <span className={sourceHighlight(sources.first_name ?? sources.last_name)}>{name || "Unnamed investor"}</span>
                  </h1>
                  <InvestorIdBadge id={investor.id} />
                  <QualitySelect investor={investor} onChange={handleQualityChange} />
                  <SourceWatermark companyId={investor.source_company_id} />
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {[investor.title, investor.company_name].filter(Boolean).join(" · ") || "No title or company yet"}
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="h-6 w-64 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {linkedinUrl && (
              <button
                type="button"
                onClick={showLinkedIn}
                title="Open the LinkedIn profile in a window beside the portal"
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-[#0a66c2] hover:bg-blue-50"
              >
                <LinkedInIcon />
                LinkedIn
              </button>
            )}
            {investor?.email && (
              <button
                type="button"
                onClick={focusComposer}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3 4a2 2 0 00-2 2v.01L10 12l9-5.99V6a2 2 0 00-2-2H3z" />
                  <path d="M18 8.118l-8 5.333-8-5.333V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                Send email
              </button>
            )}
            <NavArrow direction="up" href={profile?.prevId ? `/investors/${profile.prevId}` : null} />
            <NavArrow direction="down" href={profile?.nextId ? `/investors/${profile.nextId}` : null} />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Main column */}
          <div className="min-w-0 space-y-5">
            <EmailSetupNotice status={setup} />

            {!investor ? (
              <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            ) : investor.email ? (
              <section id="composer" className="animate-fade-in scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <EmailComposer
                  key={composer.key}
                  investorId={investor.id}
                  defaults={composer.defaults ?? newEmailDefaults(investor)}
                  title={composer.title}
                  setup={setup}
                  onCancel={resetComposer}
                  onSent={({ ok }) => {
                    if (ok) {
                      resetComposer();
                      showNotice("Email sent");
                    }
                    refresh();
                  }}
                />
              </section>
            ) : (
              <section className="animate-fade-in rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-center text-sm text-slate-500">
                No email address for this investor yet.{" "}
                <button type="button" onClick={() => setIsEditingDetails(true)} className="font-medium text-indigo-600 hover:underline">
                  Add one
                </button>{" "}
                to start emailing.
              </section>
            )}

            <Timeline
              investorId={id}
              activities={activities}
              isLoading={activitiesLoading}
              hasMore={nextCursor !== null}
              onLoadMore={() => loadActivities(nextCursor)}
              onChanged={refresh}
              onViewEmail={setViewingEmailId}
            />
          </div>

          {/* Sidebar */}
          <aside className="space-y-5">
            {investor && (
              <>
                <Card
                  title="Contact & details"
                  action={!isEditingDetails && <PencilButton label="Edit details" onClick={() => setIsEditingDetails(true)} />}
                >
                  {isEditingDetails ? (
                    <InvestorEditForm
                      investor={investor}
                      filterOptions={filterOptions}
                      onCancel={() => setIsEditingDetails(false)}
                      onSaved={() => {
                        setIsEditingDetails(false);
                        refresh();
                      }}
                    />
                  ) : (
                    <div className="-my-2 divide-y divide-slate-100">
                      <div className="flex items-center gap-3 py-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                          {initials(investor.first_name, investor.last_name)}
                        </div>
                        <div className="min-w-0 text-sm">
                          <div className="truncate font-medium text-slate-900">{name || "—"}</div>
                          <div className="truncate text-slate-500">{investor.title || "No title"}</div>
                        </div>
                      </div>
                      {investor.email && (
                        <InfoRow label="Email" source={sources.email}>
                          <span className="flex items-center justify-between">
                            <button type="button" onClick={focusComposer} className="truncate text-indigo-600 hover:underline">
                              {investor.email}
                            </button>
                            <CopyButton value={investor.email} label="email" />
                          </span>
                        </InfoRow>
                      )}
                      {investor.linkedin && (
                        <InfoRow label="LinkedIn" source={sources.linkedin}>
                          <span className="flex items-center justify-between">
                            {linkedinUrl ? (
                              <button type="button" onClick={showLinkedIn} className="flex items-center gap-1.5 text-indigo-600 hover:underline">
                                <LinkedInIcon className="h-3.5 w-3.5 text-[#0a66c2]" />
                                Open beside portal
                              </button>
                            ) : (
                              <ExternalLink value={investor.linkedin} label="View profile ↗" />
                            )}
                            <CopyButton value={investor.linkedin} label="LinkedIn URL" />
                          </span>
                          {popupBlocked && (
                            <span className="mt-1 block text-xs text-amber-700">
                              Your browser blocked the window. Allow pop-ups for this site, or{" "}
                              <ExternalLink value={investor.linkedin} label="open it in a new tab" />.
                            </span>
                          )}
                        </InfoRow>
                      )}
                      {investor.title && <InfoRow label="Title" source={sources.title}>{investor.title}</InfoRow>}
                      {investor.company_name && <InfoRow label="Company" source={sources.company_name}>{investor.company_name}</InfoRow>}
                      {investor.industry && <InfoRow label="Industry" source={sources.industry}>{investor.industry}</InfoRow>}
                      {investor.website && (
                        <InfoRow label="Website" source={sources.website}>
                          <span className="flex items-center justify-between">
                            <ExternalLink value={investor.website} label={investor.website} />
                            <CopyButton value={investor.website} label="website" />
                          </span>
                        </InfoRow>
                      )}
                      {investor.company_linkedin_url && (
                        <InfoRow label="Company LinkedIn" source={sources.company_linkedin_url}>
                          <span className="flex items-center justify-between">
                            <ExternalLink value={investor.company_linkedin_url} label="View company page ↗" />
                            <CopyButton value={investor.company_linkedin_url} label="company LinkedIn URL" />
                          </span>
                        </InfoRow>
                      )}
                      {(investor.city || investor.country) && (
                        <InfoRow label="Location" source={sources.city ?? sources.country}>
                          {[investor.city, investor.country].filter(Boolean).join(", ")}
                        </InfoRow>
                      )}
                    </div>
                  )}
                </Card>

                <Card title="Team score">
                  <TeamScoreBadge investor={investor} size="md" />
                  <ul className="mt-3 space-y-1.5">
                    {COMPANIES.map((company) => {
                      const rating = investor.team_ratings?.find((item) => item.company_id === company.id);
                      return (
                        <li key={company.id} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-slate-600">
                            <span className={`h-2 w-2 rounded-full ${company.accent}`} />
                            {company.name}
                            {company.id === user.companyId && <span className="text-xs text-slate-400">(you)</span>}
                          </span>
                          {rating ? (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${qualityBadgeClass(rating.quality)}`}>
                              {rating.quality}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Not rated</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-xs text-slate-400">Average of every company&apos;s rating (High 3 · Medium 2 · Low 1).</p>
                </Card>

                <NotesCard investorId={investor.id} notes={investor.notes} onSaved={handleCompanyDataSaved} />
                <TagsCard investorId={investor.id} tags={investor.tags} onSaved={handleCompanyDataSaved} />

                <Card title={`${companyName(user.companyId)} engagement`}>
                  <dl className="grid grid-cols-2 gap-3 text-center">
                    {[
                      { label: "Sent", value: stats?.emailsSent ?? 0 },
                      { label: "Opened", value: stats?.emailsOpened ?? 0 },
                      { label: "Received", value: stats?.emailsReceived ?? 0 },
                      { label: "Comments", value: stats?.comments ?? 0 },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl bg-slate-50 py-2.5">
                        <dt className="text-xs text-slate-500">{item.label}</dt>
                        <dd className="text-lg font-semibold text-slate-900">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-slate-500">
                    {stats?.lastEmailAt ? `Last email ${dayLabel(stats.lastEmailAt).toLowerCase()}` : "No emails yet"}
                  </p>
                </Card>

                <Card title="Source">
                  {investor.source_company_id ? (
                    <div className="space-y-1.5 text-sm text-slate-600">
                      <SourceWatermark companyId={investor.source_company_id} />
                      <div>
                        Uploaded {investor.uploaded_at ? formatDateTime(investor.uploaded_at) : ""}
                        {investor.uploaded_by_email ? ` by ${investor.uploaded_by_email}` : ""}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Original investor database</p>
                  )}
                </Card>
              </>
            )}
          </aside>
        </div>
      </div>

      {viewingEmailId && (
        <EmailViewer
          emailId={viewingEmailId}
          onClose={() => setViewingEmailId(null)}
          onReply={(email: EmailMessage) => {
            setViewingEmailId(null);
            openComposer(buildReplyDefaults(email), "Reply");
          }}
        />
      )}
    </div>
  );
}
