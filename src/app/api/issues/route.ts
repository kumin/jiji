import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

import { createIssue, errorResponse } from "@/lib/issue-actions";
import { buildIssueWhere, parseIssueFilters } from "@/lib/issue-filters";
import { ISSUE_INCLUDE, toIssueDTO } from "@/lib/issue-service";
import { prisma } from "@/lib/prisma";
import { getStatusCounts } from "@/lib/queries";
import { currentUser, UNAUTHORIZED_RESPONSE } from "@/lib/require-user";

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
  const actor = await currentUser();
  if (!actor) return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });

  const result = await createIssue(actor, await request.json().catch(() => null));
  if (!result.ok) return errorResponse(result);
  return NextResponse.json({ issue: result.value }, { status: 201 });
}
