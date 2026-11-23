import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";
import type { DashboardDTO } from "@/lib/types";

export const DASHBOARD_INCLUDE = {
  _count: { select: { issues: true } },
} satisfies Prisma.DashboardInclude;

export type DashboardWithCount = Prisma.DashboardGetPayload<{ include: typeof DASHBOARD_INCLUDE }>;

/** Converts a Prisma row into the wire format. Server only (`Date` -> ISO string). */
export function toDashboardDTO(dashboard: DashboardWithCount): DashboardDTO {
  return {
    id: dashboard.id,
    name: dashboard.name,
    description: dashboard.description,
    issueCount: dashboard._count.issues,
    createdAt: dashboard.createdAt.toISOString(),
    updatedAt: dashboard.updatedAt.toISOString(),
  };
}

/**
 * Case-insensitive name order. Done in JS rather than SQL because Postgres
 * `ORDER BY name` follows the database collation, which may sort "Zeta" before
 * "alpha"; users expect alphabetical regardless of case.
 */
export function sortByName<T extends { name: string }>(dashboards: T[]): T[] {
  return [...dashboards].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/**
 * Whether another dashboard already uses this name, ignoring case. The
 * `Dashboard_name_lower_key` index is the real guarantee; this check lets the
 * common case return a friendly 409 without relying on catching the violation.
 */
export async function nameTaken(name: string, exceptId?: string): Promise<boolean> {
  const existing = await prisma.dashboard.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** Unique-constraint violation: a concurrent request took the same name. */
export const isUniqueViolation = (error: unknown) => hasCode(error, "P2002");

/** Foreign-key violation: e.g. an issue was added while its dashboard was being deleted. */
export const isForeignKeyViolation = (error: unknown) => hasCode(error, "P2003");

/**
 * The issue's dashboard foreign key was violated: the dashboard was deleted
 * between the route's existence check and the write. Matched by constraint name
 * so a bad assignee or reporter id is not misreported as a dashboard problem.
 */
export function isDashboardForeignKeyViolation(error: unknown): boolean {
  return (
    isForeignKeyViolation(error) &&
    JSON.stringify((error as Prisma.PrismaClientKnownRequestError).meta ?? {}).includes(
      "Issue_dashboardId_fkey",
    )
  );
}

/** 400 body for an issue whose dashboard does not exist (or vanished mid-request). */
export const DASHBOARD_NOT_FOUND_RESPONSE = {
  error: "Validation failed",
  fields: { dashboardId: "Dashboard not found" },
} as const;

export const NAME_TAKEN_RESPONSE = {
  error: "Name already in use",
  fields: { name: "Another dashboard already uses this name" },
} as const;
