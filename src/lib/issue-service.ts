import type { Prisma } from "@/generated/prisma/client";

import { issueKey } from "@/lib/issue";
import type { IssueDTO, UserDTO } from "@/lib/types";

export const ISSUE_INCLUDE = {
  assignee: true,
  reporter: true,
} satisfies Prisma.IssueInclude;

export type IssueWithRelations = Prisma.IssueGetPayload<{ include: typeof ISSUE_INCLUDE }>;

type RawUser = {
  id: string;
  name: string | null;
  email: string;
  color: string;
  image: string | null;
};

/** Google accounts may have no display name, so fall back rather than render blank. */
export function toUserDTO(user: RawUser | null): UserDTO | null {
  return user
    ? {
        id: user.id,
        name: user.name ?? "Unnamed",
        email: user.email,
        color: user.color,
        image: user.image,
      }
    : null;
}

/**
 * Converts a Prisma row (Date objects) into the DTO client components expect.
 * Only call this on the server — `JSON.stringify` cannot handle `Date`.
 */
export function toIssueDTO(issue: IssueWithRelations): IssueDTO {
  return {
    id: issue.id,
    number: issue.number,
    key: issueKey(issue.number),
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    dueDate: issue.dueDate ? issue.dueDate.toISOString() : null,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    assignee: toUserDTO(issue.assignee),
    reporter: toUserDTO(issue.reporter),
  };
}
