/** Columns for EmailSummary, qualified with the given table alias. */
export function emailSummaryColumns(alias: string): string {
  return [
    "id",
    "investor_id",
    "direction",
    "status",
    "from_address",
    "from_name",
    "to_addresses",
    "cc_addresses",
    "subject",
    "snippet",
    "error",
    "is_read",
    "occurred_at",
    "opened_at",
    "open_count",
  ]
    .map((column) => `${alias}.${column}`)
    .join(", ");
}

/** A json_build_object(...) expression producing an EmailSummary from the alias. */
export function emailSummaryJson(alias: string): string {
  const pairs = emailSummaryColumns(alias)
    .split(", ")
    .map((qualified) => `'${qualified.split(".")[1]}', ${qualified}`)
    .join(", ");
  return `json_build_object(${pairs})`;
}
