import { IssuePriority } from "@/generated/prisma/enums";

import { PRIORITY_META } from "@/lib/issue";

/** Stacked-bar glyph for the priority indicator. */
export function PriorityGlyph({ priority }: { priority: IssuePriority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      title={meta.label}
      aria-label={`Priority: ${meta.label}`}
      className="inline-flex h-3 w-3 flex-col justify-end gap-[1px]"
    >
      {[0, 1, 2].map((row) => (
        <span
          key={row}
          className={`h-[3px] rounded-[1px] ${row >= 3 - meta.bars ? meta.accent : "bg-slate-200"}`}
        />
      ))}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: IssuePriority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <PriorityGlyph priority={priority} />
      <span className={meta.accent}>{meta.label}</span>
    </span>
  );
}
