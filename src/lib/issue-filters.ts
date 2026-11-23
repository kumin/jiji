import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type IssueFilters = {
  status?: IssueStatus;
  priority?: IssuePriority;
  /** The literal string "none" means "unassigned". */
  assigneeId?: string;
  q?: string;
  /** The dashboard being viewed. A scope rather than a filter (see `isFiltered`). */
  dashboardId?: string;
};

type RawParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Membership test for the generated enum objects. These are plain object
 * literals, so `value in IssueStatus` would wrongly accept every inherited
 * `Object.prototype` key ("constructor", "toString", ...) and hand Prisma an
 * enum value that does not exist. `Object.hasOwn` only sees the enum's own keys.
 */
function isEnumValue<T extends string>(enums: Record<string, T>, value: string): value is T {
  return Object.hasOwn(enums, value);
}

/** Reads filter values out of a URL's search params, ignoring unknown values. */
export function parseIssueFilters(params: RawParams): IssueFilters {
  const status = single(params.status);
  const priority = single(params.priority);
  const assigneeId = single(params.assigneeId);
  const q = single(params.q)?.trim();
  const dashboardId = single(params.dashboardId)?.trim();

  return {
    ...(status && isEnumValue(IssueStatus, status) ? { status } : {}),
    ...(priority && isEnumValue(IssuePriority, priority) ? { priority } : {}),
    ...(assigneeId ? { assigneeId } : {}),
    ...(q ? { q } : {}),
    ...(dashboardId ? { dashboardId } : {}),
  };
}

/**
 * Postgres `LIKE` treats `%` and `_` as wildcards, and Prisma does not escape
 * them for `contains` — so searching for "%" would return every issue, and "a_b"
 * would match "Kanban". Neither character is meaningful in a search term, so drop
 * them rather than let them widen the result set.
 */
function escapeLike(term: string): string {
  return term.replace(/[%_]/g, "").trim();
}

export function buildIssueWhere(filters: IssueFilters): Prisma.IssueWhereInput {
  const base = {
    ...(filters.dashboardId ? { dashboardId: filters.dashboardId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.assigneeId === "none"
      ? { assigneeId: null }
      : filters.assigneeId
        ? { assigneeId: filters.assigneeId }
        : {}),
  };

  if (!filters.q) return base;

  // `in: []` is Prisma for "no rows": the user typed something that was entirely
  // wildcards, so the honest answer is an empty result, not every issue.
  const search = escapeLike(filters.q);
  if (!search) return { ...base, id: { in: [] } };

  return {
    ...base,
    OR: [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ],
  };
}

/** Whether the user narrowed the view. The dashboard is the view itself, so it doesn't count. */
export function isFiltered(filters: IssueFilters): boolean {
  return Boolean(filters.status || filters.priority || filters.assigneeId || filters.q);
}
