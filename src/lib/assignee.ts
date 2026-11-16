import { prisma } from "@/lib/prisma";

/** The sentinel the filter UI uses for "unassigned". Accepted on writes too, so
 *  the same value works for filtering and for clearing an assignee. */
export const UNASSIGNED = "none";

export type AssigneeResult =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

/**
 * Turns a requested assignee into a value that is safe to write.
 *
 * `assigneeId` is a real foreign key, so an id that no longer matches a user
 * would otherwise surface as a Postgres constraint violation and a 500. The
 * empty string (what an empty <select> sends) and the "none" sentinel both mean
 * "no assignee".
 */
export async function resolveAssignee(
  assigneeId: string | null | undefined,
): Promise<AssigneeResult> {
  if (assigneeId === null || assigneeId === undefined || assigneeId === "" || assigneeId === UNASSIGNED) {
    return { ok: true, value: null };
  }

  const user = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
  return user
    ? { ok: true, value: user.id }
    : { ok: false, message: "That user does not exist" };
}
