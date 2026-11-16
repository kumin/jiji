import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { isAllowedEmail as isAllowedEmailFor, parseAllowedDomains } from "@/lib/email-domain";

/**
 * Provider availability is decided at startup rather than at request time.
 * Referencing Google without credentials makes Auth.js throw on every session
 * read, which would take the whole app down instead of just the login button.
 */
export const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

/**
 * Local-only sign-in for testing the app without Google credentials. Off unless
 * explicitly enabled, and hard-blocked in a deployed build. Never set
 * AUTH_DEV_LOGIN in production.
 */
export const devLoginEnabled =
  process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_LOGIN === "true";

/**
 * Sign-in is Google-only by default. With no provider at all the app would
 * quietly serve a login page that cannot log anyone in, so say so at startup.
 */
if (!googleEnabled && !devLoginEnabled) {
  console.warn(
    "[auth] No sign-in provider is configured: set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET " +
      "in .env (see README -> Google Cloud setup).",
  );
}

/**
 * Which Google accounts may sign in, as bare domains. Empty means "anyone with a
 * Google account".
 *
 * Enforced server-side in the `signIn` callback. Google hands us an `email` claim
 * but a `hd`/domain hint in the request is only a UI optimisation, so it must
 * never be the actual check.
 */
export const allowedEmailDomains = parseAllowedDomains(process.env.AUTH_ALLOWED_DOMAINS);

export function isAllowedEmail(email: string | null | undefined): boolean {
  return isAllowedEmailFor(email, allowedEmailDomains);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Google sign-in. The scopes are the sign-in set only — OpenID identity, email
 * address and profile picture. No Gmail or Drive scope is requested, so this app
 * never touches the user's mailbox and does not need Google's restricted-scope
 * verification.
 */
const googleProvider = Google({
  authorization: { params: { scope: "openid email profile" } },
});

const devProvider = Credentials({
  id: "dev-login",
  name: "Dev login",
  credentials: {
    name: { label: "Name", type: "text" },
    email: { label: "Email", type: "email" },
  },
  /**
   * Both fields are mandatory and there is no default. An earlier version fell
   * back to a shared "Dev User" account, which meant submitting the form empty
   * signed you in — and every empty submission landed on the same account.
   */
  authorize(credentials) {
    const input = (credentials ?? {}) as { name?: unknown; email?: unknown };

    const name = typeof input.name === "string" ? input.name.trim() : "";
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";

    // Returning null makes Auth.js surface a CredentialsSignin error rather than
    // minting a session.
    if (!name || !EMAIL.test(email)) return null;

    return {
      id: `dev-${slugify(email)}`,
      name,
      email,
    };
  },
});

/**
 * Edge-safe half of the Auth.js config: no Prisma adapter, so it can be bundled
 * into middleware. Sessions are JWTs, which the middleware can verify without
 * touching the database.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Self-hosted, so there is no platform-injected host header to trust.
  trustHost: true,
  providers: [...(googleEnabled ? [googleProvider] : []), ...(devLoginEnabled ? [devProvider] : [])],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
