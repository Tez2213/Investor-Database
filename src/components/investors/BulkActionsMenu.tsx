"use client";

import { useEffect, useRef, useState } from "react";
import { QUALITY_OPTIONS } from "../../lib/types";

type BulkActionsMenuProps = {
  disabled: boolean;
  onCopyEmails: () => void;
  onCopyLinkedIn: () => void;
  onSetQuality: (quality: string | null) => void;
};

const ITEM_CLASS =
  "flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100";

export function BulkActionsMenu({
  disabled,
  onCopyEmails,
  onCopyLinkedIn,
  onSetQuality,
}: BulkActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customQuality, setCustomQuality] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function run(action: () => void) {
    setIsOpen(false);
    action();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        More actions
        <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10">
          <button type="button" className={ITEM_CLASS} onClick={() => run(onCopyEmails)}>
            Copy emails
          </button>
          <button type="button" className={ITEM_CLASS} onClick={() => run(onCopyLinkedIn)}>
            Copy LinkedIn URLs
          </button>

          <div className="my-1.5 border-t border-slate-100" />
          <div className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Set quality
          </div>
          {QUALITY_OPTIONS.map((quality) => (
            <button
              key={quality}
              type="button"
              className={ITEM_CLASS}
              onClick={() => run(() => onSetQuality(quality))}
            >
              {quality}
            </button>
          ))}
          <form
            className="flex items-center gap-1.5 px-1.5 py-1"
            onSubmit={(event) => {
              event.preventDefault();
              const value = customQuality.trim();
              if (!value) return;
              setCustomQuality("");
              run(() => onSetQuality(value));
            }}
          >
            <input
              type="text"
              value={customQuality}
              onChange={(event) => setCustomQuality(event.target.value)}
              placeholder="Custom…"
              className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Set
            </button>
          </form>
          <button
            type="button"
            className={`${ITEM_CLASS} text-slate-500`}
            onClick={() => run(() => onSetQuality(null))}
          >
            Clear quality
          </button>
        </div>
      )}
    </div>
  );
}
