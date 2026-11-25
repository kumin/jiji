import { NextResponse } from "next/server";

import { deleteIssue, errorResponse, updateIssue } from "@/lib/issue-actions";
import { ISSUE_INCLUDE, toIssueDTO } from "@/lib/issue-service";
import { prisma } from "@/lib/prisma";
import { currentUser, UNAUTHORIZED_RESPONSE } from "@/lib/require-user";

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
  const actor = await currentUser();
  if (!actor) return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });

  const { id } = await params;
  const result = await updateIssue(actor, id, await request.json().catch(() => null));
  if (!result.ok) return errorResponse(result);
  return NextResponse.json({ issue: result.value });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const actor = await currentUser();
  if (!actor) return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });

  const { id } = await params;
  const result = await deleteIssue(actor, id);
  if (!result.ok) return errorResponse(result);
  return new NextResponse(null, { status: 204 });
}
