import { NextResponse } from "next/server";

import { canTransition, STATUS_META, TRANSITIONS } from "@/lib/issue";
import { ISSUE_INCLUDE, toIssueDTO } from "@/lib/issue-service";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/require-user";
import { fieldErrors, transitionSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Workflow-guarded status change. Separate from PATCH so the board can move
 * cards through a single endpoint that always enforces TRANSITIONS.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await authorize("issue:edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = transitionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const issue = await prisma.issue.findUnique({
    where: { id },
    include: ISSUE_INCLUDE,
  });

  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  if (issue.status === parsed.data.status) {
    return NextResponse.json({ issue: toIssueDTO(issue) });
  }

  if (!canTransition(issue.status, parsed.data.status)) {
    return NextResponse.json(
      {
        error: `${STATUS_META[issue.status].label} cannot move straight to ${STATUS_META[parsed.data.status].label}`,
        from: issue.status,
        allowed: TRANSITIONS[issue.status],
      },
      { status: 409 },
    );
  }

  const updated = await prisma.issue.update({
    where: { id },
    data: { status: parsed.data.status },
    include: ISSUE_INCLUDE,
  });

  return NextResponse.json({ issue: toIssueDTO(updated) });
}
