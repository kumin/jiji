import { auth } from "@/lib/auth";

/**
 * The signed-in user's id, or null when there is no session. Middleware already
 * blocks anonymous requests, but mutating routes re-check so they stay correct
 * if they are ever called directly (tests, another server, a widened matcher).
 */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
