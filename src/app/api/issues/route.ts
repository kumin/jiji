import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

import { resolveAssignee } from "@/lib/assignee";
import {
  DASHBOARD_NOT_FOUND_RESPONSE,
  isDashboardForeignKeyViolation,
} from "@/lib/dashboard-service";
import { buildIssueWhere, parseIssueFilters } from "@/lib/issue-filters";
import { ISSUE_INCLUDE, toIssueDTO } from "@/lib/issue-service";
import { prisma } from "@/lib/prisma";
import { getStatusCounts } from "@/lib/queries";
import { currentUserId } from "@/lib/require-user";
import { fieldErrors, issueCreateSchema } from "@/lib/validation";

const SORTABLE = {
  number: "number",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  title: "title",
} as const;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = parseIssueFilters(Object.fromEntries(params));

  const sortKey = params.get("sort") ?? "number";
  const direction = params.get("direction") === "asc" ? "asc" : "desc";
  // `Object.hasOwn`, not `SORTABLE[sortKey] ?? "number"`: a plain object literal
  // inherits from Object.prototype, so `SORTABLE["constructor"]` yields a
  // function rather than undefined and would reach Prisma as a bogus column.
  const sortField = Object.hasOwn(SORTABLE, sortKey)
    ? (sortKey as keyof typeof SORTABLE)
    : "number";
  const orderBy: Prisma.IssueOrderByWithRelationInput = { [sortField]: direction };

  const issues = await prisma.issue.findMany({
    where: buildIssueWhere(filters),
    include: ISSUE_INCLUDE,
    orderBy,
  });

  // Per-status totals across the whole dashboard (or every issue when no
  // dashboard is given), so filter chips keep stable numbers while the other
  // filters are applied.
  const counts = await getStatusCounts(filters.dashboardId);

  return NextResponse.json({
    issues: issues.map(toIssueDTO),
    counts,
    total: issues.length,
  });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = issueCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const dashboard = await prisma.dashboard.findUnique({
    where: { id: parsed.data.dashboardId },
    select: { id: true },
  });
  if (!dashboard) {
    return NextResponse.json(DASHBOARD_NOT_FOUND_RESPONSE, { status: 400 });
  }

  if (parsed.data.assigneeId !== undefined) {
    const assignee = await resolveAssignee(parsed.data.assigneeId);
    if (!assignee.ok) {
      return NextResponse.json(
        { error: "Validation failed", fields: { assigneeId: assignee.message } },
        { status: 400 },
      );
    }
    parsed.data.assigneeId = assignee.value;
  }

  // The JWT outlives the row it names: a re-seeded database (or a deleted
  // account) leaves a valid cookie pointing at a user that no longer exists,
  // and the reporter foreign key would then fail. Say so instead of 500ing.
  const reporter = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!reporter) {
    return NextResponse.json(
      { error: "Your account no longer exists. Sign in again." },
      { status: 401 },
    );
  }

  try {
    const issue = await prisma.issue.create({
      // The reporter is always the signed-in user, never the request body.
      data: { ...parsed.data, reporterId: userId },
      include: ISSUE_INCLUDE,
    });
    return NextResponse.json({ issue: toIssueDTO(issue) }, { status: 201 });
  } catch (error) {
    // The dashboard was deleted after the check above.
    if (isDashboardForeignKeyViolation(error)) {
      return NextResponse.json(DASHBOARD_NOT_FOUND_RESPONSE, { status: 400 });
    }
    throw error;
  }
}
