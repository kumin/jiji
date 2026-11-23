import type { Role } from "@/generated/prisma/enums";

/**
 * Who may change what. Pure and shared: API routes enforce it, and the UI uses
 * the same answers to hide or disable controls. Reading is open to every
 * signed-in user, so only writes appear here.
 */
export type Action =
  | "issue:create"
  | "issue:edit"
  | "issue:delete"
  | "dashboard:manage"
  | "user:manageRoles";

/** The signed-in user as permissions see them. */
export type Actor = { id: string; role: Role };

/** What `issue:delete` needs to know about the issue. */
export type IssueOwnership = { reporterId: string | null };

/** Why `actor` may not perform `action`, or null when it is allowed. */
export function denyReason(
  actor: Actor,
  action: Action,
  issue?: IssueOwnership,
): string | null {
  if (actor.role === "ADMIN") return null;

  switch (action) {
    case "issue:create":
      return actor.role === "VIEWER" ? "Viewers can't create issues" : null;
    case "issue:edit":
      return actor.role === "VIEWER" ? "Viewers can't edit issues" : null;
    case "issue:delete":
      if (actor.role === "VIEWER") return "Viewers can't delete issues";
      return issue && issue.reporterId === actor.id
        ? null
        : "Members can only delete issues they reported";
    case "dashboard:manage":
      return "Only Admins can manage dashboards";
    case "user:manageRoles":
      return "Only Admins can change roles";
  }
}

/** Whether `actor` may perform `action`. No actor (signed out) may do nothing. */
export function can(actor: Actor | null, action: Action, issue?: IssueOwnership): boolean {
  return actor !== null && denyReason(actor, action, issue) === null;
}
