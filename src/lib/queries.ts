import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

import { notFound } from "next/navigation";

import { DASHBOARD_INCLUDE, sortByName, toDashboardDTO } from "@/lib/dashboard-service";
import { ISSUE_INCLUDE, toIssueDTO, toUserDTO } from "@/lib/issue-service";
import { prisma } from "@/lib/prisma";
import { STATUS_ORDER } from "@/lib/issue";
import type { DashboardDTO, IssueDTO, UserDTO } from "@/lib/types";

export async function listIssues(
  where: Prisma.IssueWhereInput = {},
  orderBy: Prisma.IssueOrderByWithRelationInput = { number: "desc" },
): Promise<IssueDTO[]> {
  const issues = await prisma.issue.findMany({
    where,
    orderBy,
    include: ISSUE_INCLUDE,
  });
  return issues.map(toIssueDTO);
}

export async function getIssue(id: string): Promise<IssueDTO | null> {
  const issue = await prisma.issue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
  return issue ? toIssueDTO(issue) : null;
}

export async function listUsers(): Promise<UserDTO[]> {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return users.map((user) => toUserDTO(user)!);
}

/** Per-status totals, across one dashboard when given, otherwise across all issues. */
export async function getStatusCounts(dashboardId?: string): Promise<Record<IssueStatus, number>> {
  const grouped = await prisma.issue.groupBy({
    by: ["status"],
    where: dashboardId ? { dashboardId } : {},
    _count: { _all: true },
  });
  return Object.fromEntries(
    STATUS_ORDER.map((status) => [
      status,
      grouped.find((group) => group.status === status)?._count._all ?? 0,
    ]),
  ) as Record<IssueStatus, number>;
}

export const ALL_PRIORITIES = Object.values(IssuePriority);

export async function listDashboards(): Promise<DashboardDTO[]> {
  const dashboards = await prisma.dashboard.findMany({ include: DASHBOARD_INCLUDE });
  return sortByName(dashboards.map(toDashboardDTO));
}

/**
 * The dashboard a page should show, from its `?dashboard=<id>` param. With no
 * param it falls back to the first dashboard by name; an unknown id is a 404.
 * Returns null only when no dashboards exist at all.
 */
export async function resolveDashboard(
  param: string | string[] | undefined,
  dashboards?: DashboardDTO[],
): Promise<DashboardDTO | null> {
  const all = dashboards ?? (await listDashboards());
  const id = Array.isArray(param) ? param[0] : param;
  if (!id) return all[0] ?? null;
  return all.find((dashboard) => dashboard.id === id) ?? notFound();
}
