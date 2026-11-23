import { NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { toUserDTO } from "@/lib/issue-service";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/require-user";
import { fieldErrors, userRolePatchSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

const LAST_ADMIN_RESPONSE = { error: "At least one Admin is required" };

class LastAdminError extends Error {}

/** Change a user's role. Admins only; the last Admin can't be demoted. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await authorize("user:manageRoles");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = userRolePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }
  const { role } = parsed.data;

  try {
    // Serializable, so two Admins demoting each other at once can't both pass
    // the count and leave nobody in charge; the loser gets P2034.
    const user = await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id }, select: { role: true } });
        if (!target) return null;
        if (target.role === "ADMIN" && role !== "ADMIN") {
          const otherAdmins = await tx.user.count({ where: { role: "ADMIN", id: { not: id } } });
          if (otherAdmins === 0) throw new LastAdminError();
        }
        return tx.user.update({ where: { id }, data: { role } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user: toUserDTO(user) });
  } catch (error) {
    if (error instanceof LastAdminError) {
      return NextResponse.json(LAST_ADMIN_RESPONSE, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(LAST_ADMIN_RESPONSE, { status: 409 });
    }
    throw error;
  }
}
