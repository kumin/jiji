import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "@/generated/prisma/client";
import { isWriteConflict } from "@/lib/prisma-errors";

function adapterError(kind: string) {
  const error = new Error(kind, { cause: { kind } });
  error.name = "DriverAdapterError";
  return error;
}

describe("isWriteConflict", () => {
  it("recognises Prisma's P2034", () => {
    const error = new Prisma.PrismaClientKnownRequestError("conflict", {
      code: "P2034",
      clientVersion: "test",
    });
    assert.equal(isWriteConflict(error), true);
  });

  it("recognises a conflict the driver adapter reports at commit", () => {
    assert.equal(isWriteConflict(adapterError("TransactionWriteConflict")), true);
  });

  it("ignores other errors", () => {
    const otherPrisma = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "test",
    });
    assert.equal(isWriteConflict(otherPrisma), false);
    assert.equal(isWriteConflict(adapterError("TableDoesNotExist")), false);
    assert.equal(isWriteConflict(new Error("TransactionWriteConflict")), false);
    assert.equal(isWriteConflict(null), false);
  });
});
