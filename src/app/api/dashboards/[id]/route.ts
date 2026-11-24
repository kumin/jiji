import { NextResponse } from "next/server";

import {
  DASHBOARD_INCLUDE,
  NAME_TAKEN_RESPONSE,
  isForeignKeyViolation,
  isUniqueViolation,
  nameTaken,
  toDashboardDTO,
} from "@/lib/dashboard-service";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/require-user";
import { dashboardPatchSchema, fieldErrors } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

const NOT_FOUND = { error: "Dashboard not found" };

function stillHasIssues(issueCount: number) {
  return NextResponse.json({ error: "Dashboard still has issues", issueCount }, { status: 409 });
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const dashboard = await prisma.dashboard.findUnique({ where: { id }, include: DASHBOARD_INCLUDE });

  if (!dashboard) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  return NextResponse.json({ dashboard: toDashboardDTO(dashboard) });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await authorize("dashboard:manage");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = dashboardPatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const existing = await prisma.dashboard.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  // Excluding this dashboard lets a case-only rename ("web" -> "Web") through.
  if (parsed.data.name !== undefined && (await nameTaken(parsed.data.name, id))) {
    return NextResponse.json(NAME_TAKEN_RESPONSE, { status: 409 });
  }

  try {
    const dashboard = await prisma.dashboard.update({
      where: { id },
      data: parsed.data,
      include: DASHBOARD_INCLUDE,
    });
    return NextResponse.json({ dashboard: toDashboardDTO(dashboard) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(NAME_TAKEN_RESPONSE, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await authorize("dashboard:manage");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const existing = await prisma.dashboard.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  const issueCount = await prisma.issue.count({ where: { dashboardId: id } });
  if (issueCount > 0) {
    return stillHasIssues(issueCount);
  }

  try {
    await prisma.dashboard.delete({ where: { id } });
  } catch (error) {
    // An issue was created here between the count and the delete; the
    // Restrict foreign key refused the delete. Report the fresh count.
    if (isForeignKeyViolation(error)) {
      return stillHasIssues(await prisma.issue.count({ where: { dashboardId: id } }));
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
