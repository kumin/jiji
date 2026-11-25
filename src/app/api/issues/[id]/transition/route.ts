import { NextResponse } from "next/server";

import { errorResponse, transitionIssue } from "@/lib/issue-actions";
import { currentUser, UNAUTHORIZED_RESPONSE } from "@/lib/require-user";

type RouteContext = { params: Promise<{ id: string }> };

/** Workflow-guarded status change; see `transitionIssue`. */
export async function POST(request: Request, { params }: RouteContext) {
  const actor = await currentUser();
  if (!actor) return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });

  const { id } = await params;
  const result = await transitionIssue(actor, id, await request.json().catch(() => null));
  if (!result.ok) return errorResponse(result);
  return NextResponse.json({ issue: result.value });
}
