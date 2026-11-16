import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

import { ISSUE_INCLUDE, toIssueDTO, toUserDTO } from "@/lib/issue-service";
import { prisma } from "@/lib/prisma";
import { STATUS_ORDER } from "@/lib/issue";
import type { IssueDTO, UserDTO } from "@/lib/types";

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

export async function getStatusCounts(): Promise<Record<IssueStatus, number>> {
  const grouped = await prisma.issue.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(
    STATUS_ORDER.map((status) => [
      status,
      grouped.find((group) => group.status === status)?._count._all ?? 0,
    ]),
  ) as Record<IssueStatus, number>;
}

export const ALL_PRIORITIES = Object.values(IssuePriority);
