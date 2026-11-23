import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "@/generated/prisma/client";
import { isDashboardForeignKeyViolation } from "@/lib/dashboard-service";

/** Shaped like the errors the pg driver adapter actually produces. */
function fkError(constraint: string) {
  return new Prisma.PrismaClientKnownRequestError("Foreign key constraint violated", {
    code: "P2003",
    clientVersion: "test",
    meta: {
      modelName: "Issue",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: { kind: "ForeignKeyConstraintViolation", constraint: { index: constraint } },
      },
    },
  });
}

describe("isDashboardForeignKeyViolation", () => {
  it("recognises a violation of the issue's dashboard foreign key", () => {
    assert.equal(isDashboardForeignKeyViolation(fkError("Issue_dashboardId_fkey")), true);
  });

  it("ignores other foreign keys and other errors", () => {
    assert.equal(isDashboardForeignKeyViolation(fkError("Issue_assigneeId_fkey")), false);
    assert.equal(isDashboardForeignKeyViolation(fkError("Issue_reporterId_fkey")), false);
    assert.equal(isDashboardForeignKeyViolation(new Error("Issue_dashboardId_fkey")), false);
    assert.equal(isDashboardForeignKeyViolation(null), false);
  });
});
