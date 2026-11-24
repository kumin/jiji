import { createHash, randomBytes } from "node:crypto";

/**
 * Personal access tokens for the MCP endpoint. A token is `jiji_` plus 32
 * random bytes; only its SHA-256 hash is stored, so a database leak doesn't
 * leak working tokens. Plain SHA-256 (no salt or slow hash) is enough because
 * the token is random and long, not a guessable password.
 */
const TOKEN_PREFIX = "jiji_";
const DAY_MS = 24 * 60 * 60 * 1000;

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** What the tokens page shows so the owner can tell their tokens apart. */
export function tokenPrefix(token: string): string {
  return token.slice(0, 9);
}

/** The token from an `Authorization: Bearer jiji_...` header, or null. */
export function parseBearer(header: string | null | undefined): string | null {
  const match = /^bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  const token = match?.[1];
  return token?.startsWith(TOKEN_PREFIX) ? token : null;
}

export function expiresAtFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

export function isExpired(token: { expiresAt: Date }, now: Date = new Date()): boolean {
  return token.expiresAt.getTime() <= now.getTime();
}
