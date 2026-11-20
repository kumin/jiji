import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";

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
