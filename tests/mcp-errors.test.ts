import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatActionError } from "@/lib/mcp/errors";

describe("formatActionError", () => {
  it("names the reason for a forbidden action", () => {
    assert.equal(
      formatActionError({
        ok: false,
        status: 403,
        body: { error: "Forbidden", reason: "Viewers can't edit issues" },
      }),
      "Forbidden: Viewers can't edit issues",
    );
  });

  it("lists every invalid field", () => {
    assert.equal(
      formatActionError({
        ok: false,
        status: 400,
        body: {
          error: "Validation failed",
          fields: { title: "Title is required", dueDate: "Expected YYYY-MM-DD" },
        },
      }),
      "Validation failed: title: Title is required; dueDate: Expected YYYY-MM-DD",
    );
  });

  it("says which statuses a blocked transition may move to", () => {
    assert.equal(
      formatActionError({
        ok: false,
        status: 409,
        body: { error: "To Do cannot move straight to Done", from: "TODO", allowed: ["IN_PROGRESS"] },
      }),
      "To Do cannot move straight to Done (allowed: IN_PROGRESS)",
    );
  });

  it("falls back to the error message", () => {
    assert.equal(
      formatActionError({ ok: false, status: 404, body: { error: "Issue not found" } }),
      "Issue not found",
    );
  });
});
