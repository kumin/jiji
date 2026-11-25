import { NextResponse } from "next/server";

import {
  API_TOKEN_SELECT,
  expiresAtFrom,
  generateToken,
  hashToken,
  toApiTokenDTO,
  tokenPrefix,
} from "@/lib/api-tokens";
import { prisma } from "@/lib/prisma";
import { currentUser, UNAUTHORIZED_RESPONSE } from "@/lib/require-user";
import { apiTokenCreateSchema, fieldErrors } from "@/lib/validation";

/**
 * Your own personal access tokens. These routes need a browser session: the
 * middleware only accepts Bearer tokens at /api/mcp, so a token can't mint
 * more tokens.
 */
export async function GET() {
  // currentUser, not currentUserId: a session can outlive its user row (a
  // re-seeded database), and the token's foreign key would then fail.
  const userId = (await currentUser())?.id;
  if (!userId) return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });

  const rows = await prisma.apiToken.findMany({
    where: { userId },
    select: API_TOKEN_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ apiTokens: rows.map(toApiTokenDTO) });
}

export async function POST(request: Request) {
  // currentUser, not currentUserId: a session can outlive its user row (a
  // re-seeded database), and the token's foreign key would then fail.
  const userId = (await currentUser())?.id;
  if (!userId) return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });

  const parsed = apiTokenCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const token = generateToken();
  const row = await prisma.apiToken.create({
    data: {
      userId,
      name: parsed.data.name,
      tokenHash: hashToken(token),
      prefix: tokenPrefix(token),
      expiresAt: expiresAtFrom(new Date(), parsed.data.expiresInDays),
    },
    select: API_TOKEN_SELECT,
  });

  // The only time the token itself leaves the server.
  return NextResponse.json({ apiToken: toApiTokenDTO(row), token }, { status: 201 });
}
