import { createHash, randomBytes } from "node:crypto";

import type { Actor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ApiTokenDTO } from "@/lib/types";

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

type ApiTokenRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
};

export function toApiTokenDTO(row: ApiTokenRow): ApiTokenDTO {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export const API_TOKEN_SELECT = {
  id: true,
  name: true,
  prefix: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
} as const;

/**
 * The user a Bearer header acts as, or null when the header is missing, the
 * token is unknown (or revoked, which deletes it) or it has expired. The role
 * comes from the user row on every call, so a role change applies to existing
 * tokens straight away. Marks the token as used.
 */
export async function actorFromBearer(
  header: string | null | undefined,
  now: Date = new Date(),
): Promise<Actor | null> {
  const token = parseBearer(header);
  if (!token) return null;

  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, expiresAt: true, user: { select: { id: true, role: true } } },
  });
  if (!row || isExpired(row, now)) return null;

  await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  return row.user;
}
