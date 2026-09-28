"use client";

import { useState } from "react";
import { EDITABLE_FIELDS, type Activity, type FieldChange } from "../../lib/types";
import { companyById } from "../../lib/companies";
import { dayLabel, formatTime, initialsOf } from "../../lib/format";
import { useSession } from "../SessionProvider";

const FIELD_LABELS: Record<FieldChange["field"], string> = {
  ...(Object.fromEntries(EDITABLE_FIELDS.map((field) => [field.key, field.label])) as Record<
    Exclude<FieldChange["field"], "quality">,
    string
  >),
  quality: "Quality",
};

type TimelineProps = {
  investorId: string | number;
  activities: Activity[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onChanged: () => void;
  onViewEmail: (emailId: string) => void;
};

function Value({ value }: { value: string | null }) {
  return value ? (
    <span className="rounded bg-slate-100 px-1 font-medium text-slate-800">{value}</span>
  ) : (
    <span className="italic text-slate-400">empty</span>
  );
}

function Expandable({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex items-center gap-1 text-left">
        <span>{summary}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function ViewEmailButton({ emailId, onViewEmail }: { emailId: string | null; onViewEmail: (id: string) => void }) {
  if (!emailId) return null;
  return (
    <button
      type="button"
      onClick={() => onViewEmail(emailId)}
      className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
    >
      View email
    </button>
  );
}

/** "Opened 2×" / "Not opened yet" under a sent email; nothing for untracked emails. */
function OpenStatus({ email }: { email: NonNullable<Activity["email"]> }) {
  if (email.opened_at) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-200">
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
          <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
        </svg>
        Opened{email.open_count > 1 ? ` ${email.open_count}×` : ""}
      </span>
    );
  }
  return null;
}

const DOT_COLORS: Record<Activity["kind"], string> = {
  comment: "bg-sky-500",
  field_change: "bg-slate-400",
  email_sent: "bg-indigo-500",
  email_failed: "bg-rose-500",
  email_received: "bg-emerald-500",
  email_opened: "bg-teal-500",
  notes_updated: "bg-amber-400",
  tags_updated: "bg-violet-400",
};

function ActivityContent({ activity, onViewEmail }: { activity: Activity; onViewEmail: (id: string) => void }) {
  const actor = <span className="font-semibold text-slate-900">{activity.actor || "Someone"}</span>;
  const email = activity.email;

  switch (activity.kind) {
    case "comment":
      return (
        <div>
          <div className="text-sm">{actor}</div>
          <div className="mt-1.5 whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm">
            {activity.body}
          </div>
        </div>
      );

    case "field_change": {
      const changes = activity.details.changes ?? [];
      const suffix = activity.details.bulk ? <span className="text-slate-400"> (bulk update)</span> : null;
      if (changes.length === 1) {
        const [change] = changes;
        return (
          <div className="text-sm text-slate-700">
            {actor} changed {FIELD_LABELS[change.field] ?? change.field} from <Value value={change.from} /> to{" "}
            <Value value={change.to} />
            {suffix}
          </div>
        );
      }
      return (
        <div className="text-sm text-slate-700">
          <Expandable
            summary={
              <>
                {actor} updated {changes.length} fields{suffix}
              </>
            }
          >
            <ul className="space-y-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
              {changes.map((change) => (
                <li key={change.field}>
                  <span className="text-slate-500">{FIELD_LABELS[change.field] ?? change.field}:</span>{" "}
                  <Value value={change.from} /> → <Value value={change.to} />
                </li>
              ))}
            </ul>
          </Expandable>
        </div>
      );
    }

    case "email_opened": {
      const count = email?.open_count ?? 1;
      return (
        <div className="text-sm text-slate-700">
          <div>
            {actor} opened your email{" "}
            {email?.subject && <span className="font-medium text-slate-900">“{email.subject}”</span>}
            {count > 1 && <span className="text-slate-400"> · opened {count} times</span>}
          </div>
          <ViewEmailButton emailId={activity.email_id} onViewEmail={onViewEmail} />
        </div>
      );
    }

    case "email_sent":
    case "email_failed":
    case "email_received": {
      const subject = email?.subject ? <span className="font-medium text-slate-900">“{email.subject}”</span> : null;
      let line: React.ReactNode;
      if (activity.kind === "email_received") {
        const from = email?.from_name || email?.from_address || activity.actor;
        line = (
          <>
            <span className="font-semibold text-slate-900">{from}</span> sent an email {subject}
          </>
        );
      } else if (activity.kind === "email_failed") {
        line = (
          <>
            <span className="font-medium text-rose-700">Email could not be sent</span> to{" "}
            {email?.to_addresses.join(", ")} {subject}
            {email?.error && <div className="mt-1 text-xs text-rose-600">{email.error}</div>}
          </>
        );
      } else {
        line = (
          <>
            {actor} sent an email to {email?.to_addresses.join(", ") || "the investor"} {subject}
          </>
        );
      }
      return (
        <div className="text-sm text-slate-700">
          <div>{line}</div>
          {activity.kind === "email_sent" && email && <OpenStatus email={email} />}
          {email?.snippet && <div className="mt-1 line-clamp-2 text-xs text-slate-500">{email.snippet}</div>}
          <ViewEmailButton emailId={activity.email_id} onViewEmail={onViewEmail} />
        </div>
      );
    }

    case "notes_updated":
      return (
        <div className="text-sm text-slate-700">
          {activity.body ? (
            <Expandable summary={<>{actor} updated the notes</>}>
              <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                {activity.body}
              </div>
            </Expandable>
          ) : (
            <>{actor} cleared the notes</>
          )}
        </div>
      );

    case "tags_updated": {
      const added = activity.details.added ?? [];
      const removed = activity.details.removed ?? [];
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
          {actor}
          {added.length > 0 && (
            <>
              <span>added</span>
              {added.map((tag) => (
                <span key={`+${tag}`} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                  {tag}
                </span>
              ))}
            </>
          )}
          {added.length > 0 && removed.length > 0 && <span>and</span>}
          {removed.length > 0 && (
            <>
              <span>removed</span>
              {removed.map((tag) => (
                <span key={`-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 line-through">
                  {tag}
                </span>
              ))}
            </>
          )}
        </div>
      );
    }

    default:
      return <div className="text-sm text-slate-700">{activity.body}</div>;
  }
}

function CommentBox({ investorId, onPosted }: { investorId: string | number; onPosted: () => void }) {
  const user = useSession();
  const name = user.name || user.email;
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    if (!text.trim() || isPosting) return;
    setIsPosting(true);
    setError(null);
    try {
      const response = await fetch(`/api/investors/${investorId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "Could not post the comment");
      }
      setText("");
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the comment");
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ${
              companyById(user.homeCompanyId)?.accent ?? "bg-sky-500"
            }`}
          >
            {initialsOf(name)}
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) post();
            }}
            rows={text.includes("\n") ? 4 : 2}
            maxLength={5000}
            placeholder="Leave a comment..."
            className="min-h-10 w-full resize-y border-0 bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2.5">
          <span className="text-xs text-rose-600">{error}</span>
          <button
            type="button"
            onClick={post}
            disabled={!text.trim() || isPosting}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {isPosting ? "Posting..." : "Post"}
          </button>
        </div>
      </div>
      <div className="mt-1.5 text-right text-xs text-slate-400">
        Only your {companyById(user.companyId)?.name} team can see this timeline
      </div>
    </div>
  );
}

/** Investor activity feed: comments, edits, emails, notes and tags, newest first. */
export function Timeline({ investorId, activities, isLoading, hasMore, onLoadMore, onChanged, onViewEmail }: TimelineProps) {
  const groups: { label: string; items: Activity[] }[] = [];
  for (const activity of activities) {
    const label = dayLabel(activity.created_at);
    const group = groups[groups.length - 1];
    if (group && group.label === label) group.items.push(activity);
    else groups.push({ label, items: [activity] });
  }

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-slate-900">Timeline</h2>
      <CommentBox investorId={investorId} onPosted={onChanged} />

      <div className="relative ml-5 mt-2 border-l-2 border-slate-200 pb-2">
        {isLoading && activities.length === 0 && (
          <div className="space-y-3 py-4 pl-8">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
          </div>
        )}

        {!isLoading && activities.length === 0 && (
          <div className="py-6 pl-8 text-sm text-slate-400">
            No activity yet. Comments, edits and emails with this investor will show up here.
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label}>
            <div className="pb-1 pl-8 pt-6 text-sm text-slate-500">{group.label}</div>
            <ol>
              {group.items.map((activity) => (
                <li key={activity.id} className="relative py-3 pl-8">
                  <span
                    className={`absolute -left-[7px] top-[18px] h-3 w-3 rounded-full ring-4 ring-slate-50 ${DOT_COLORS[activity.kind] ?? "bg-slate-400"}`}
                  />
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <ActivityContent activity={activity} onViewEmail={onViewEmail} />
                    </div>
                    <time
                      dateTime={activity.created_at}
                      title={new Date(activity.created_at).toLocaleString()}
                      className="shrink-0 pt-0.5 text-sm text-slate-500"
                    >
                      {formatTime(activity.created_at)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}

        {hasMore && (
          <div className="pl-8 pt-2">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoading}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {isLoading ? "Loading..." : "Show older activity"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
