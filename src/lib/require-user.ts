import { NextResponse } from "next/server";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { type Action, type Actor, type IssueOwnership, denyReason } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * The signed-in user's id, or null when there is no session. Middleware already
 * blocks anonymous requests, but mutating routes re-check so they stay correct
 * if they are ever called directly (tests, another server, a widened matcher).
 */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * The signed-in user with their role, or null when there is no session (or the
 * session points at a deleted user). The role is read from the database on
 * each request rather than stored in the session token, so a role change takes
 * effect on the user's next request without signing in again.
 *
 * Wrapped in React's `cache`, so the layout and the page share one lookup per
 * render instead of querying twice.
 */
export const currentUser = cache(async (): Promise<Actor | null> => {
  const id = await currentUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
});

export const UNAUTHORIZED_RESPONSE = { error: "Unauthorized" } as const;

/**
 * For write routes: the actor when they may perform `action`, otherwise the
 * response to return (401 without a session, 403 with a reason when the role
 * forbids it). Call it before parsing the body so a forbidden caller can't
 * probe which inputs would be valid.
 */
export async function authorize(
  action: Action,
  issue?: IssueOwnership,
): Promise<{ actor: Actor } | NextResponse> {
  const actor = await currentUser();
  if (!actor) return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  const reason = denyReason(actor, action, issue);
  if (reason) return forbidden(reason);
  return { actor };
}

export function forbidden(reason: string) {
  return NextResponse.json({ error: "Forbidden", reason }, { status: 403 });
}
