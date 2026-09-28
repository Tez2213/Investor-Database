"use client";

import { useState } from "react";

const FRAME_STYLE = `<style>body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;word-wrap:break-word}img{max-width:100%;height:auto}</style>`;

/**
 * Renders an email body. HTML (which comes from outside senders) is shown in a
 * sandboxed iframe with scripts disabled; links open in a new tab.
 */
export function EmailBody({ html, text }: { html: string | null; text: string | null }) {
  const [height, setHeight] = useState(120);

  if (!html) {
    return (
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
        {text || <span className="text-slate-400">(No message body)</span>}
      </div>
    );
  }

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'"><base target="_blank">${FRAME_STYLE}</head><body>${html}</body></html>`;

  return (
    <iframe
      title="Email content"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="w-full rounded-md border-0 bg-white"
      style={{ height }}
      onLoad={(event) => {
        const doc = event.currentTarget.contentDocument;
        if (doc) setHeight(Math.min(Math.max(doc.documentElement.scrollHeight + 8, 80), 4000));
      }}
    />
  );
}
