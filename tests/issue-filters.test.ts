import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import {
  buildIssueWhere,
  isFiltered,
  parseIssueFilters,
} from "@/lib/issue-filters";

/** Every inherited key that a plain object literal would wrongly report as present. */
const INHERITED_KEYS = [
  "constructor",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "__proto__",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
];

describe("parseIssueFilters", () => {
  it("accepts real enum values", () => {
    assert.deepEqual(parseIssueFilters({ status: "IN_REVIEW" }), {
      status: "IN_REVIEW",
    });
    assert.deepEqual(parseIssueFilters({ priority: "HIGH" }), { priority: "HIGH" });
  });

  it("rejects inherited Object.prototype keys", () => {
    // Regression: `"constructor" in IssueStatus` is true, which used to hand
    // Prisma a non-existent enum and 500 the whole request.
    for (const key of INHERITED_KEYS) {
      assert.deepEqual(
        parseIssueFilters({ status: key }),
        {},
        `status=${key} should be ignored`,
      );
      assert.deepEqual(
        parseIssueFilters({ priority: key }),
        {},
        `priority=${key} should be ignored`,
      );
    }
  });

  it("rejects unknown and case-mismatched enum values", () => {
    for (const value of ["todo", "IN REVIEW", "ARCHIVED", "", " "]) {
      assert.deepEqual(parseIssueFilters({ status: value }), {});
    }
  });

  it("takes the first value of a repeated parameter", () => {
    assert.deepEqual(parseIssueFilters({ status: ["DONE", "TODO"] }), {
      status: "DONE",
    });
  });

  it("trims the search term and drops a blank one", () => {
    assert.deepEqual(parseIssueFilters({ q: "  board  " }), { q: "board" });
    assert.deepEqual(parseIssueFilters({ q: "   " }), {});
  });

  it("keeps the unassigned sentinel", () => {
    assert.deepEqual(parseIssueFilters({ assigneeId: "none" }), {
      assigneeId: "none",
    });
  });
});

describe("buildIssueWhere", () => {
  it("passes valid enum filters through", () => {
    assert.deepEqual(buildIssueWhere({ status: IssueStatus.DONE }), {
      status: "DONE",
    });
  });

  it("treats the none sentinel as unassigned", () => {
    assert.deepEqual(buildIssueWhere({ assigneeId: "none" }), { assigneeId: null });
  });

  it("searches title and description", () => {
    const where = buildIssueWhere({ q: "board" });
    assert.equal(Array.isArray(where.OR), true);
    assert.deepEqual(where.OR, [
      { title: { contains: "board", mode: "insensitive" } },
      { description: { contains: "board", mode: "insensitive" } },
    ]);
  });

  it("does not let LIKE wildcards widen the result set", () => {
    // Postgres treats % and _ as wildcards and Prisma does not escape them, so
    // "%" used to match every issue. Stripping to nothing must mean "no rows".
    for (const term of ["%", "_", "%%", "__", "%%%"]) {
      assert.deepEqual(
        buildIssueWhere({ q: term }),
        { id: { in: [] } },
        `"${term}" should match nothing`,
      );
    }
  });

  it("strips wildcards from an otherwise real term", () => {
    assert.deepEqual(buildIssueWhere({ q: "a_b" }), {
      OR: [
        { title: { contains: "ab", mode: "insensitive" } },
        { description: { contains: "ab", mode: "insensitive" } },
      ],
    });
    assert.deepEqual(buildIssueWhere({ q: "50% off" }), {
      OR: [
        { title: { contains: "50 off", mode: "insensitive" } },
        { description: { contains: "50 off", mode: "insensitive" } },
      ],
    });
  });

  it("omits the search clause entirely when there is no term", () => {
    assert.equal("OR" in buildIssueWhere({}), false);
    assert.equal("OR" in buildIssueWhere({ status: IssueStatus.TODO }), false);
  });

  it("composes filters together", () => {
    const where = buildIssueWhere({
      status: IssueStatus.TODO,
      priority: IssuePriority.HIGH,
      assigneeId: "user-1",
      q: "board",
    });
    assert.equal(where.status, "TODO");
    assert.equal(where.priority, "HIGH");
    assert.equal(where.assigneeId, "user-1");
    assert.ok(where.OR);
  });
});

describe("isFiltered", () => {
  it("is false for no filters and true for any single one", () => {
    assert.equal(isFiltered({}), false);
    assert.equal(isFiltered({ status: IssueStatus.TODO }), true);
    assert.equal(isFiltered({ priority: IssuePriority.LOW }), true);
    assert.equal(isFiltered({ assigneeId: "none" }), true);
    assert.equal(isFiltered({ q: "board" }), true);
  });
});
