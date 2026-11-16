/**
 * Which Google accounts may sign in, and the helpers that decide.
 *
 * Kept separate from `auth.config.ts` so the rules can be tested without
 * re-importing a module that reads `process.env` at load time.
 */

/** Parses a comma-separated allowlist into bare, lowercase domains. */
export function parseAllowedDomains(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/**
 * Whether an email's domain is on the allowlist. An empty list allows any
 * address, which is the "anyone with a Google account" default.
 *
 * Only the exact domain matches: `a@mail.gmail.com` is not `gmail.com`, and a
 * crafted `a@gmail.com@evil.test` does not resolve to `gmail.com` because we
 * take the part after the *last* `@`.
 */
export function isAllowedEmail(email: string | null | undefined, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  if (!email) return false;

  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return false;

  return allowedDomains.includes(email.slice(at + 1).toLowerCase());
}
