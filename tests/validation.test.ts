import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import {
  dashboardCreateSchema,
  dashboardPatchSchema,
  fieldErrors,
  issueCreateSchema,
  issuePatchSchema,
  transitionSchema,
} from "@/lib/validation";

describe("issueCreateSchema", () => {
  it("requires a dashboard", () => {
    for (const dashboardId of [undefined, "", "   "]) {
      const parsed = issueCreateSchema.safeParse({ title: "x", dashboardId });
      assert.equal(parsed.success, false, String(dashboardId));
      if (!parsed.success) assert.equal(typeof fieldErrors(parsed.error).dashboardId, "string");
    }
    assert.equal(issueCreateSchema.parse({ title: "x", dashboardId: "d1" }).dashboardId, "d1");
  });

  it("defaults status and priority to the start of the workflow", () => {
    const parsed = issueCreateSchema.parse({ title: "  Ship it  ", dashboardId: "d1" });
    assert.equal(parsed.title, "Ship it", "title should be trimmed");
    assert.equal(parsed.status, IssueStatus.TODO);
    assert.equal(parsed.priority, IssuePriority.MEDIUM);
  });

  it("stores empty text as null", () => {
    const parsed = issueCreateSchema.parse({ dashboardId: "d1", title: "x", description: "   " });
    assert.equal(parsed.description, null);
  });

  it("treats a missing optional field as null on create", () => {
    const parsed = issueCreateSchema.parse({ dashboardId: "d1", title: "x" });
    assert.equal(parsed.description, null);
    assert.equal(parsed.dueDate, null);
    assert.equal(parsed.assigneeId, null);
  });

  it("requires a non-empty title", () => {
    for (const title of ["", "   ", undefined]) {
      assert.equal(issueCreateSchema.safeParse({ dashboardId: "d1", title }).success, false, String(title));
    }
  });

  it("caps the title at 255 characters", () => {
    assert.equal(issueCreateSchema.safeParse({ dashboardId: "d1", title: "a".repeat(255) }).success, true);
    assert.equal(issueCreateSchema.safeParse({ dashboardId: "d1", title: "a".repeat(256) }).success, false);
  });

  it("has no reporterId field, so a client cannot forge the reporter", () => {
    assert.equal("reporterId" in issueCreateSchema.shape, false);
    // An unknown key is stripped rather than passed through to Prisma.
    const parsed = issueCreateSchema.parse({ dashboardId: "d1", title: "x", reporterId: "someone-else" });
    assert.equal("reporterId" in parsed, false);
  });

  it("rejects inherited Object.prototype keys as enum values", () => {
    for (const key of ["constructor", "toString", "__proto__"]) {
      assert.equal(
        issueCreateSchema.safeParse({ dashboardId: "d1", title: "x", status: key }).success,
        false,
        key,
      );
    }
  });

  it("reads a due date as UTC midnight, not local midnight", () => {
    const parsed = issueCreateSchema.parse({ dashboardId: "d1", title: "x", dueDate: "2026-03-18" });
    assert.equal(parsed.dueDate?.toISOString(), "2026-03-18T00:00:00.000Z");
  });

  it("rejects a malformed due date", () => {
    for (const dueDate of ["18/03/2026", "2026-3-18", "tomorrow", "2026-03-18T00:00"]) {
      assert.equal(
        issueCreateSchema.safeParse({ dashboardId: "d1", title: "x", dueDate }).success,
        false,
        dueDate,
      );
    }
  });

  it("accepts an empty due date meaning no date", () => {
    assert.equal(issueCreateSchema.parse({ dashboardId: "d1", title: "x", dueDate: "" }).dueDate, null);
  });
});

describe("issuePatchSchema", () => {
  it("does not reset status or priority when they are omitted", () => {
    // Regression: deriving the patch schema with `.partial()` kept Zod 4's
    // `.default()` active, so every PATCH silently reset the issue.
    const parsed = issuePatchSchema.parse({ title: "renamed" });
    assert.deepEqual(parsed, { title: "renamed" });
    assert.equal("status" in parsed, false);
    assert.equal("priority" in parsed, false);
  });

  it("rejects an empty patch", () => {
    assert.equal(issuePatchSchema.safeParse({}).success, false);
  });

  it("leaves an absent key absent so it cannot clobber a column", () => {
    const parsed = issuePatchSchema.parse({ assigneeId: "user-1" });
    assert.deepEqual(Object.keys(parsed), ["assigneeId"]);
  });

  it("clears a field when explicitly set to an empty value", () => {
    const parsed = issuePatchSchema.parse({ description: "", dueDate: "" });
    assert.deepEqual(parsed, { description: null, dueDate: null });
  });

  it("validates the fields it does receive", () => {
    assert.equal(issuePatchSchema.safeParse({ status: "NOPE" }).success, false);
    assert.equal(issuePatchSchema.safeParse({ title: "" }).success, false);
    assert.equal(issuePatchSchema.safeParse({ dueDate: "18/03/2026" }).success, false);
  });
});

describe("transitionSchema", () => {
  it("accepts real statuses and rejects everything else", () => {
    for (const status of Object.values(IssueStatus)) {
      assert.equal(transitionSchema.safeParse({ status }).success, true, status);
    }
    for (const status of ["constructor", "toString", "ARCHIVED", "", 42, null]) {
      assert.equal(transitionSchema.safeParse({ status }).success, false, String(status));
    }
  });

  it("requires the status key", () => {
    assert.equal(transitionSchema.safeParse({}).success, false);
  });
});

describe("fieldErrors", () => {
  it("flattens issues into a field-keyed object", () => {
    const parsed = issuePatchSchema.safeParse({ title: "" });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.deepEqual(fieldErrors(parsed.error), { title: "Title is required" });
    }
  });

  it("keeps the first message per field", () => {
    const parsed = issueCreateSchema.safeParse({ dashboardId: "d1", title: "", dueDate: "nope" });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      assert.equal(errors.title, "Title is required");
      assert.equal(typeof errors.dueDate, "string");
    }
  });

  it("returns an empty object when there are no issues", () => {
    assert.deepEqual(fieldErrors({ issues: [] } as never), {});
  });
});

describe("dashboardCreateSchema", () => {
  it("trims the name", () => {
    assert.equal(dashboardCreateSchema.parse({ name: "  Website  " }).name, "Website");
  });

  it("requires a non-blank name of at most 80 characters", () => {
    for (const name of [undefined, "", "   ", "a".repeat(81)]) {
      const parsed = dashboardCreateSchema.safeParse({ name });
      assert.equal(parsed.success, false, String(name));
      if (!parsed.success) assert.equal(typeof fieldErrors(parsed.error).name, "string");
    }
    assert.equal(dashboardCreateSchema.safeParse({ name: "a".repeat(80) }).success, true);
  });

  it("stores a blank description as null", () => {
    for (const description of [undefined, "", "   ", null]) {
      assert.equal(
        dashboardCreateSchema.parse({ name: "x", description }).description,
        null,
        String(description),
      );
    }
  });

  it("caps the description at 500 characters after trimming", () => {
    assert.equal(
      dashboardCreateSchema.safeParse({ name: "x", description: "a".repeat(500) }).success,
      true,
    );
    assert.equal(
      dashboardCreateSchema.safeParse({ name: "x", description: ` ${"a".repeat(500)} ` }).success,
      true,
    );
    const tooLong = dashboardCreateSchema.safeParse({ name: "x", description: "a".repeat(501) });
    assert.equal(tooLong.success, false);
    if (!tooLong.success) assert.equal(typeof fieldErrors(tooLong.error).description, "string");
  });
});

describe("dashboardPatchSchema", () => {
  it("rejects an empty patch", () => {
    assert.equal(dashboardPatchSchema.safeParse({}).success, false);
  });

  it("accepts a name, a description, or both", () => {
    assert.deepEqual(dashboardPatchSchema.parse({ name: " Site " }), { name: "Site" });
    assert.deepEqual(dashboardPatchSchema.parse({ description: "" }), { description: null });
    assert.deepEqual(dashboardPatchSchema.parse({ name: "a", description: "b" }), {
      name: "a",
      description: "b",
    });
  });

  it("leaves an absent key absent", () => {
    // JSON bodies cannot carry `undefined`, so "absent" means the key is missing.
    const parsed = dashboardPatchSchema.parse({ name: "a" });
    assert.deepEqual(Object.keys(parsed), ["name"]);
  });

  it("validates the fields it does receive", () => {
    assert.equal(dashboardPatchSchema.safeParse({ name: "" }).success, false);
    assert.equal(dashboardPatchSchema.safeParse({ description: "a".repeat(501) }).success, false);
  });
});
