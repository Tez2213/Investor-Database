"use client";

import { useMemo, useRef, useState } from "react";
import type { EmailSetupStatus, EmailTemplate } from "../../lib/types";
import { notifyMailChanged } from "../AppHeader";
import type { ComposerDefaults } from "./replyDefaults";
import { TemplatesMenu } from "./TemplatesMenu";

const PLACEHOLDERS = [
  { token: "{{first_name}}", label: "First name" },
  { token: "{{full_name}}", label: "Full name" },
  { token: "{{company}}", label: "Company" },
];

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60";

const KNOWN_PLACEHOLDERS = new Set(["first_name", "last_name", "full_name", "company"]);
const SPAM_WORDS =
  /\b((?<!feel )free|guarantee(d)?|risk[- ]free|act now|urgent|limited time|click here|winner|no obligation|earn money|double your|100% (free|guaranteed)|cash bonus|lowest price|buy now|order now)\b|\${2,}/i;

/** Things in an email that make spam filters (or the reader) suspicious. Advice only; never blocks sending. */
function spamHints(subject: string, body: string): string[] {
  const hints: string[] = [];
  const letters = subject.replace(/[^a-z]/gi, "");
  if (letters.length >= 6 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7) {
    hints.push("The subject is mostly capital letters.");
  }
  if ((subject.match(/!/g) ?? []).length >= 2 || /!!/.test(body)) hints.push("Several exclamation marks look like marketing.");
  const spammy = `${subject}\n${body}`.match(SPAM_WORDS);
  if (spammy) hints.push(`Words like "${spammy[0]}" are common in spam.`);
  const links = body.match(/https?:\/\/\S+/g) ?? [];
  if (links.length > 2) hints.push(`${links.length} links: keep a first email to one or two.`);
  if (links.some((link) => /bit\.ly|tinyurl|t\.co\/|goo\.gl|ow\.ly/i.test(link))) hints.push("Short links (bit.ly etc.) are often blocked; use the full address.");
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > 300) hints.push(`${words} words: short emails (under 150 words) get more replies.`);
  const unknown = (`${subject} ${body}`.match(/\{\{\s*([^{}]*?)\s*\}\}/g) ?? []).filter(
    (token) => !KNOWN_PLACEHOLDERS.has(token.replace(/[{}\s]/g, ""))
  );
  if (unknown.length > 0) hints.push(`${unknown[0]} can't be filled in. Use one of the Insert buttons below.`);
  return hints;
}

function parseAddresses(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((address) => address.trim())
    .filter(Boolean);
}

type EmailComposerProps = {
  investorId?: string | number | null;
  defaults: ComposerDefaults;
  setup: EmailSetupStatus | null;
  /** Called after a send attempt was recorded (ok=false when the mail server refused it). */
  onSent: (result: { ok: boolean }) => void;
  onCancel?: () => void;
  title?: string;
};

/** Write and send an email from the company's connected mailbox. */
export function EmailComposer({ investorId, defaults, setup, onSent, onCancel, title }: EmailComposerProps) {
  const [to, setTo] = useState(defaults.to.join(", "));
  const [cc, setCc] = useState((defaults.cc ?? []).join(", "));
  const [showCc, setShowCc] = useState((defaults.cc ?? []).length > 0);
  const [subject, setSubject] = useState(defaults.subject ?? "");
  const [body, setBody] = useState(defaults.body ?? "");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An address that bounced before: the person can still choose to send.
  const [bouncedWarning, setBouncedWarning] = useState<string | null>(null);
  const hints = useMemo(() => spamHints(subject, body), [subject, body]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const notConfigured = setup !== null && !setup.smtpConfigured;

  function insertPlaceholder(token: string) {
    const textarea = bodyRef.current;
    if (!textarea) {
      setBody((previous) => previous + token);
      return;
    }
    const start = textarea.selectionStart ?? body.length;
    const end = textarea.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function applyTemplate(template: EmailTemplate) {
    const isReply = Boolean(defaults.replyToEmailId);
    // Replies keep their "Re:" subject so the email stays in the same thread.
    if (template.subject && !isReply) setSubject(template.subject);
    if (!template.body) return;
    const untouched = body === (defaults.body ?? "") || !body.trim();
    if (untouched) {
      // Start from the template; on a reply keep the quoted message below it.
      const next = isReply ? `${template.body}${defaults.body ?? ""}` : template.body;
      setBody(next);
      requestAnimationFrame(() => {
        const textarea = bodyRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(template.body.length, template.body.length);
      });
    } else {
      insertPlaceholder(template.body);
    }
  }

  async function handleSend(event?: React.FormEvent, options: { allowBounced?: boolean } = {}) {
    event?.preventDefault();
    if (isSending) return;
    setError(null);
    setBouncedWarning(null);
    setIsSending(true);
    try {
      const response = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId: investorId ?? null,
          to: parseAddresses(to),
          cc: showCc ? parseAddresses(cc) : [],
          subject,
          body,
          replyToEmailId: defaults.replyToEmailId ?? null,
          allowBounced: options.allowBounced === true,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (result?.code === "bounced_before") {
          setBouncedWarning(result.error);
          return;
        }
        setError(result?.error ?? `Sending failed (status ${response.status})`);
        // A refused send is still recorded on the timeline as a failed email.
        if (response.status === 502) onSent({ ok: false });
        return;
      }
      notifyMailChanged();
      onSent({ ok: true });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form
      onSubmit={handleSend}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) handleSend();
      }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">{title ?? "New email"}</div>
        <div className="flex min-w-0 items-center gap-3">
          {setup?.fromAddress && (
            <div className="hidden truncate text-xs text-slate-500 sm:block">
              From: {setup.fromName ? `${setup.fromName} <${setup.fromAddress}>` : setup.fromAddress}
            </div>
          )}
          <TemplatesMenu subject={subject} body={body} onUse={applyTemplate} disabled={isSending} />
        </div>
      </div>

      {notConfigured && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          Your company&apos;s mailbox isn&apos;t connected yet. You can write the email now; sending will
          work once your admin connects the mailbox.
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-sm text-slate-500">To</span>
        <input
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="name@company.com, another@company.com"
          disabled={isSending}
          className={INPUT_CLASS}
        />
        {!showCc && (
          <button
            type="button"
            onClick={() => setShowCc(true)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            Cc
          </button>
        )}
      </div>

      {showCc && (
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-sm text-slate-500">Cc</span>
          <input
            value={cc}
            onChange={(event) => setCc(event.target.value)}
            placeholder="Optional"
            disabled={isSending}
            className={INPUT_CLASS}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-sm text-slate-500">Subject</span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={300}
          disabled={isSending}
          className={INPUT_CLASS}
        />
      </div>

      <textarea
        ref={bodyRef}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={9}
        placeholder={"Hi {{first_name}},\n\n…"}
        disabled={isSending}
        className={`${INPUT_CLASS} resize-y font-[inherit] leading-relaxed`}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-400">Insert:</span>
        {PLACEHOLDERS.map((placeholder) => (
          <button
            key={placeholder.token}
            type="button"
            onClick={() => insertPlaceholder(placeholder.token)}
            className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 hover:bg-slate-200"
            title={`Replaced with the investor's ${placeholder.label.toLowerCase()} when sent`}
          >
            {placeholder.token}
          </button>
        ))}
      </div>

      {hints.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          <div className="font-medium">Tips to stay out of spam</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {hints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </div>
      )}

      {bouncedWarning && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          <div>{bouncedWarning}</div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => handleSend(undefined, { allowBounced: true })}
              disabled={isSending}
              className="rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
            >
              Send anyway
            </button>
            <button type="button" onClick={() => setBouncedWarning(null)} className="rounded-md px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto hidden text-xs text-slate-400 sm:inline">⌘ + Enter to send</span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Discard
          </button>
        )}
        <button
          type="submit"
          disabled={isSending || notConfigured || !to.trim() || !subject.trim() || !body.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
          </svg>
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
