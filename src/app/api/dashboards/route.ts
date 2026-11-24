import { NextResponse } from "next/server";

import {
  DASHBOARD_INCLUDE,
  NAME_TAKEN_RESPONSE,
  isUniqueViolation,
  nameTaken,
  sortByName,
  toDashboardDTO,
} from "@/lib/dashboard-service";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/require-user";
import { dashboardCreateSchema, fieldErrors } from "@/lib/validation";

export async function GET() {
  const dashboards = await prisma.dashboard.findMany({ include: DASHBOARD_INCLUDE });
  return NextResponse.json({ dashboards: sortByName(dashboards.map(toDashboardDTO)) });
}

export async function POST(request: Request) {
  const auth = await authorize("dashboard:manage");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const parsed = dashboardCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  if (await nameTaken(parsed.data.name)) {
    return NextResponse.json(NAME_TAKEN_RESPONSE, { status: 409 });
  }

  try {
    const dashboard = await prisma.dashboard.create({
      data: parsed.data,
      include: DASHBOARD_INCLUDE,
    });
    return NextResponse.json({ dashboard: toDashboardDTO(dashboard) }, { status: 201 });
  } catch (error) {
    // Lost a race with a concurrent create of the same name.
    if (isUniqueViolation(error)) {
      return NextResponse.json(NAME_TAKEN_RESPONSE, { status: 409 });
    }
    throw error;
  }
}
