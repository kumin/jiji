import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";

export const ISSUE_KEY_PREFIX = "JIJI";

/** Left-to-right order of the workflow. Drives board column order. */
export const STATUS_ORDER = [
  IssueStatus.TODO,
  IssueStatus.IN_PROGRESS,
  IssueStatus.IN_REVIEW,
  IssueStatus.DONE,
] as const satisfies readonly IssueStatus[];

type StatusMeta = {
  label: string;
  /** Text/icon color for the badge. */
  accent: string;
  /** Background + border for the badge chip. */
  chip: string;
  /** Accent used for the board column header. */
  dot: string;
};

export const STATUS_META: Record<IssueStatus, StatusMeta> = {
  TODO: {
    label: "To Do",
    accent: "text-slate-700",
    chip: "bg-slate-100 text-slate-700 ring-slate-300",
    dot: "bg-slate-400",
  },
  IN_PROGRESS: {
    label: "In Progress",
    accent: "text-blue-700",
    chip: "bg-blue-50 text-blue-700 ring-blue-300",
    dot: "bg-blue-500",
  },
  IN_REVIEW: {
    label: "In Review",
    accent: "text-amber-700",
    chip: "bg-amber-50 text-amber-700 ring-amber-300",
    dot: "bg-amber-500",
  },
  DONE: {
    label: "Done",
    accent: "text-emerald-700",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-300",
    dot: "bg-emerald-500",
  },
};

type PriorityMeta = {
  label: string;
  /** Number of filled bars in the priority glyph, 1-5. */
  bars: number;
  accent: string;
};

export const PRIORITY_ORDER = [
  IssuePriority.HIGHEST,
  IssuePriority.HIGH,
  IssuePriority.MEDIUM,
  IssuePriority.LOW,
  IssuePriority.LOWEST,
] as const satisfies readonly IssuePriority[];

export const PRIORITY_META: Record<IssuePriority, PriorityMeta> = {
  HIGHEST: { label: "Highest", bars: 5, accent: "text-rose-600" },
  HIGH: { label: "High", bars: 4, accent: "text-orange-500" },
  MEDIUM: { label: "Medium", bars: 3, accent: "text-blue-500" },
  LOW: { label: "Low", bars: 2, accent: "text-slate-400" },
  LOWEST: { label: "Lowest", bars: 1, accent: "text-slate-300" },
};

/**
 * Allowed status moves. Like Jira, the workflow is enforced: the API rejects
 * illegal transitions and the board greys out unreachable columns.
 */
export const TRANSITIONS: Record<IssueStatus, readonly IssueStatus[]> = {
  TODO: [IssueStatus.IN_PROGRESS],
  IN_PROGRESS: [IssueStatus.TODO, IssueStatus.IN_REVIEW],
  IN_REVIEW: [IssueStatus.IN_PROGRESS, IssueStatus.DONE],
  DONE: [IssueStatus.IN_REVIEW],
};

export function canTransition(from: IssueStatus, to: IssueStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function issueKey(number: number): string {
  return `${ISSUE_KEY_PREFIX}-${number}`;
}
