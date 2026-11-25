import { Prisma } from "@/generated/prisma/client";

/**
 * Whether a transaction lost a serialization race (Postgres 40001 or a 40P01
 * deadlock), so nothing was saved and a retry is safe. Prisma reports it as
 * P2034 when the query fails, but a conflict detected at COMMIT reaches us
 * straight from the pg driver adapter as a `DriverAdapterError` whose cause
 * is `{ kind: "TransactionWriteConflict" }`, so both shapes are checked.
 */
export function isWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2034";
  if (!(error instanceof Error) || error.name !== "DriverAdapterError") return false;
  const cause = error.cause as { kind?: unknown } | undefined;
  return cause?.kind === "TransactionWriteConflict";
}
