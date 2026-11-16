import { IssueStatus } from "@/generated/prisma/enums";

import { STATUS_META } from "@/lib/issue";

export function StatusBadge({ status }: { status: IssueStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.chip}`}
    >
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
