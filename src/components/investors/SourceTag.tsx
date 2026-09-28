import type { FieldSource } from "../../lib/types";
import { SOURCE_STYLES } from "../../lib/format";

/** Small "Predicted" / "Edited" pill shown next to a field label. */
export function SourceTag({ source }: { source: FieldSource | undefined }) {
  if (!source) return null;
  const style = SOURCE_STYLES[source];
  return (
    <span
      title={style.description}
      className="ml-2 inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-500 ring-1 ring-slate-200"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
