import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { currentUser, UNAUTHORIZED_RESPONSE } from "@/lib/require-user";

type RouteContext = { params: Promise<{ id: string }> };

/** Revoke one of your own tokens. Someone else's token is reported as not found. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  // currentUser, not currentUserId: a session can outlive its user row (a
  // re-seeded database), and the token's foreign key would then fail.
  const userId = (await currentUser())?.id;
  if (!userId) return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });

  const { id } = await params;
  const { count } = await prisma.apiToken.deleteMany({ where: { id, userId } });
  if (count === 0) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
