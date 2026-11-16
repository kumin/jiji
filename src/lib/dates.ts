import { IssueStatus } from "@/generated/prisma/enums";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string | Date): string {
  return dateFmt.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Midnight of the day `now` falls in, in UTC — due dates are stored at UTC midnight. */
function todayUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

type DueState = { label: string; className: string } | null;

/**
 * Renders a due date relative to today, flagging overdue work. Returns null when
 * there is no date. A finished issue keeps the information but loses the
 * urgency, since it can no longer miss the date.
 *
 * `now` defaults to the current time, which is fine for server components. A
 * client component must be handed the same instant by its server parent —
 * otherwise SSR and hydration can disagree (a card rendered as "Due today"
 * becomes "1 day overdue" if hydration lands after midnight UTC) and React
 * cannot patch the difference.
 */
export function describeDue(
  dueDate: string | null,
  status: IssueStatus,
  now: Date = new Date(),
): DueState {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  const done = status === IssueStatus.DONE;

  // Compare calendar days, not elapsed milliseconds. Rounding the raw
  // difference would put a due date of 23:59 today at 0.999 days out, which
  // rounds up and reports it as "Due tomorrow".
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const days = Math.round((dueDay - todayUtc(now).getTime()) / 86_400_000);

  if (days < 0) {
    const overdue = Math.abs(days);
    const label = overdue === 1 ? "1 day overdue" : `${overdue} days overdue`;
    // A finished issue cannot still miss a date, so don't flag it in red.
    return { label, className: done ? "text-slate-500" : "text-rose-600 font-medium" };
  }

  if (days === 0) return { label: "Due today", className: done ? "" : "text-amber-600 font-medium" };
  if (days === 1) return { label: "Due tomorrow", className: done ? "" : "text-amber-600" };

  return { label: `Due ${formatDate(dueDate)}`, className: done ? "text-slate-500" : "" };
}
