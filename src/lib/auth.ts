import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import { isAdminEmail } from "@/lib/admin-emails";
import { avatarColor } from "@/lib/avatar-color";
import { allowedEmailDomains, authConfig, isAllowedEmail } from "@/lib/auth.config";
import { prisma } from "@/lib/prisma";

/**
 * The Node.js half of the Auth.js config. The Prisma adapter lives here rather
 * than in `auth.config.ts` because it pulls in the database client, which cannot
 * be bundled into edge middleware.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Two jobs: restrict Google sign-in to the allowed domains, and provision the
     * User row for the dev-login provider.
     *
     * This has to live in the `signIn` callback rather than in `events.signIn`:
     * Auth.js only logs errors thrown by event handlers, so throwing there would
     * leave a rejected sign-in looking successful.
     */
    async signIn({ user, account }) {
      // --- Google: domain allowlist -----------------------------------------
      if (account?.provider === "google") {
        if (!user.email) return false;
        if (!isAllowedEmail(user.email)) {
          console.warn(
            `[auth] rejected ${user.email}: domain not in AUTH_ALLOWED_DOMAINS ` +
              `(${allowedEmailDomains.join(", ") || "none set"})`,
          );
          return false;
        }
        // Google marks addresses it has not confirmed with email_verified: false
        // (Workspace aliases can look that way). Treat an explicit false as fatal
        // but stay quiet if a profile omits the claim.
        const verified = (account as { profile?: { email_verified?: unknown } })?.profile
          ?.email_verified;
        if (verified === false) return false;
        return true;
      }

      // --- Dev login ---------------------------------------------------------
      if (account?.provider !== "dev-login" || !user.id) return true;

      // The session carries `user.id`, so that id must address a real row. Email
      // is unique and our id is derived from it, so an email already taken by a
      // *different* id (seeded demo data, say) would mint a session pointing at a
      // user that does not exist, and every later write would die on
      // `Issue_reporterId_fkey`. Deny instead.
      if (user.email) {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true },
        });
        if (existing && existing.id !== user.id) return false;
      }

      await prisma.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          name: user.name ?? "Dev User",
          email: user.email ?? `${user.id}@example.com`,
          color: avatarColor(user.id),
        },
        update: { name: user.name ?? "Dev User" },
      });

      return true;
    },
  },
  events: {
    /**
     * Promote ADMIN_EMAILS users. This is an event rather than part of the
     * `signIn` callback because a first-time Google user's row is only created
     * by the adapter after that callback returns; events run once it exists.
     * A failure here is only logged, which at worst leaves someone a Member.
     */
    async signIn({ user }) {
      if (!isAdminEmail(user.email)) return;
      await prisma.user.updateMany({
        where: { email: { equals: user.email!, mode: "insensitive" }, role: { not: "ADMIN" } },
        data: { role: "ADMIN" },
      });
    },
    // Google supplies a name and picture but no colour, so derive one per user.
    async createUser({ user }) {
      if (!user.id) return;
      await prisma.user.update({
        where: { id: user.id },
        data: { color: avatarColor(user.id) },
      });
    },
  },
});
