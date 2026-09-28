/** Records a browser-only action (download, copy) in the admin audit log. Fire and forget. */
export function track(action: "csv_exported" | "emails_copied" | "linkedin_copied", details: Record<string, string | number | boolean> = {}) {
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, details }),
    keepalive: true,
  }).catch(() => undefined);
}
