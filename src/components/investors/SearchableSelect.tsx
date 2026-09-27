"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SearchableSelectProps = {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

export function SearchableSelect({
  label,
  placeholder,
  value,
  options,
  onChange,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!query) return options;
    const lowerQuery = query.toLowerCase();
    return options.filter((option) =>
      option.toLowerCase().includes(lowerQuery)
    );
  }, [options, query]);

  return (
    <div ref={containerRef} className="relative w-full sm:w-48">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
          value
            ? "border-indigo-200 bg-indigo-50/60 text-indigo-900"
            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
        }`}
      >
        <span className="truncate">{value || placeholder}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
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

      {open && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
          <div className="border-b border-slate-100 p-2">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50"
            >
              All {label}
            </button>

            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-400">
                No matches
              </div>
            )}

            {filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                  setQuery("");
                }}
                className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-indigo-50 ${
                  option === value
                    ? "bg-indigo-50 font-medium text-indigo-700"
                    : "text-slate-700"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
