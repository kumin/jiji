import { IssuePriority, IssueStatus, Role } from "@/generated/prisma/enums";

/**
 * Wire format for issue data handed to client components. Mirrors the JSON the
 * API returns, where every timestamp is an ISO string.
 */
export type UserDTO = {
  id: string;
  name: string;
  email: string;
  color: string;
  /** Google profile picture, when the account has one. */
  image: string | null;
  role: Role;
};

export type IssueDTO = {
  id: string;
  number: number;
  key: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: UserDTO | null;
  reporter: UserDTO | null;
  dashboard: { id: string; name: string };
};

export type DashboardDTO = {
  id: string;
  name: string;
  description: string | null;
  issueCount: number;
  createdAt: string;
  updatedAt: string;
};

/** A personal access token as listed to its owner. The token itself is never included. */
export type ApiTokenDTO = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
};
