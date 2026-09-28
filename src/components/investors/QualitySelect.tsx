"use client";

import { useState } from "react";
import { QUALITY_OPTIONS, type Investor } from "../../lib/types";
import { qualityBadgeClass } from "../../lib/format";

type QualitySelectProps = {
  investor: Investor;
  onChange: (investor: Investor, quality: string | null) => Promise<void>;
};

const CUSTOM_QUALITY = "__custom__";

const BADGE_CLASS =
  "cursor-pointer appearance-none rounded-full py-0.5 pl-2.5 pr-6 text-xs font-medium ring-1 ring-inset outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-60";

/** Inline quality picker for a table row: High / Medium / Low, any custom value, or none. */
export function QualitySelect({ investor, onChange }: QualitySelectProps) {
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const current = investor.quality ?? "";
  const isEdited = investor.field_sources?.quality === "edited";
  const hasCustomValue =
    current !== "" && !(QUALITY_OPTIONS as readonly string[]).includes(current);

  async function save(next: string) {
    const value = next.trim();
    setIsCustom(false);
    if (value === current) return;
    setIsSaving(true);
    try {
      await onChange(investor, value || null);
    } finally {
      setIsSaving(false);
    }
  }

  if (isCustom) {
    return (
      <input
        type="text"
        autoFocus
        maxLength={50}
        value={customValue}
        placeholder="Type, then Enter"
        onChange={(event) => setCustomValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (customValue.trim()) save(customValue);
          } else if (event.key === "Escape") {
            event.stopPropagation();
            setIsCustom(false);
          }
        }}
        onBlur={() => setIsCustom(false)}
        className="w-32 rounded-full border border-indigo-300 bg-white px-2.5 py-0.5 text-xs text-slate-900 outline-none ring-2 ring-indigo-100"
      />
    );
  }

  const tone = current
    ? qualityBadgeClass(current)
    : "bg-white text-slate-400 ring-slate-200";

  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label="Quality"
        value={current}
        disabled={isSaving}
        onChange={(event) => {
          if (event.target.value === CUSTOM_QUALITY) {
            setCustomValue(hasCustomValue ? current : "");
            setIsCustom(true);
          } else {
            save(event.target.value);
          }
        }}
        title={isEdited ? "Quality (edited)" : "Set quality"}
        className={`${BADGE_CLASS} ${tone} ${
          isEdited ? "outline-2 outline-offset-1 outline-sky-300" : ""
        }`}
      >
        <option value="">{current ? "Clear (not set)" : "Set…"}</option>
        {QUALITY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {hasCustomValue && <option value={current}>{current}</option>}
        <option value={CUSTOM_QUALITY}>Custom…</option>
      </select>
      <svg
        className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-slate-500"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}
