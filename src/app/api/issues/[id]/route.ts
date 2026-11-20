import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/require-user";
import { resolveAssignee } from "@/lib/assignee";
import { ISSUE_INCLUDE, toIssueDTO } from "@/lib/issue-service";
import { fieldErrors, issuePatchSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const issue = await prisma.issue.findUnique({ where: { id }, include: ISSUE_INCLUDE });

  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  return NextResponse.json({ issue: toIssueDTO(issue) });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!(await currentUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = issuePatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  // `issuePatchSchema` rejects an empty object, so `changes` is never a no-op.
  const changes = parsed.data;

  if (changes.assigneeId !== undefined) {
    const assignee = await resolveAssignee(changes.assigneeId);
    if (!assignee.ok) {
      return NextResponse.json(
        { error: "Validation failed", fields: { assigneeId: assignee.message } },
        { status: 400 },
      );
    }
    changes.assigneeId = assignee.value;
  }

  // Moving to another dashboard: an unknown id would otherwise surface as a
  // foreign-key violation and a 500.
  if (changes.dashboardId !== undefined) {
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: changes.dashboardId },
      select: { id: true },
    });
    if (!dashboard) {
      return NextResponse.json(
        { error: "Validation failed", fields: { dashboardId: "Dashboard not found" } },
        { status: 400 },
      );
    }
  }

  const existing = await prisma.issue.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const issue = await prisma.issue.update({
    where: { id },
    data: changes,
    include: ISSUE_INCLUDE,
  });

  return NextResponse.json({ issue: toIssueDTO(issue) });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  if (!(await currentUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.issue.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  await prisma.issue.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
