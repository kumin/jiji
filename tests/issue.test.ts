import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import {
  ISSUE_KEY_PREFIX,
  PRIORITY_META,
  PRIORITY_ORDER,
  STATUS_META,
  STATUS_ORDER,
  TRANSITIONS,
  canTransition,
  issueKey,
} from "@/lib/issue";

const ALL_STATUSES = Object.values(IssueStatus);

describe("workflow", () => {
  it("only allows moves declared in TRANSITIONS", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        assert.equal(
          canTransition(from, to),
          TRANSITIONS[from].includes(to),
          `${from} -> ${to}`,
        );
      }
    }
  });

  it("never allows a no-op move", () => {
    for (const status of ALL_STATUSES) {
      assert.equal(canTransition(status, status), false, status);
    }
  });

  it("lets every status reach DONE by following the allowed edges", () => {
    // Breadth-first search over the declared edges: no status may be stranded.
    const seen = new Set<IssueStatus>([IssueStatus.TODO]);
    const queue: IssueStatus[] = [IssueStatus.TODO];
    while (queue.length) {
      const from = queue.shift()!;
      for (const to of TRANSITIONS[from]) {
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    assert.deepEqual([...seen].sort(), [...ALL_STATUSES].sort());
  });

  it("keeps every allowed move reversible", () => {
    for (const from of ALL_STATUSES) {
      for (const to of TRANSITIONS[from]) {
        assert.ok(
          TRANSITIONS[to].includes(from),
          `${from} -> ${to} cannot be undone`,
        );
      }
    }
  });

  it("does not allow skipping a review straight from To Do", () => {
    assert.equal(canTransition(IssueStatus.TODO, IssueStatus.DONE), false);
    assert.equal(canTransition(IssueStatus.TODO, IssueStatus.IN_REVIEW), false);
  });
});

describe("metadata", () => {
  it("has display metadata for every status", () => {
    for (const status of ALL_STATUSES) {
      assert.ok(STATUS_META[status]?.label, status);
    }
  });

  it("has display metadata for every priority", () => {
    for (const priority of Object.values(IssuePriority)) {
      assert.ok(PRIORITY_META[priority]?.label, priority);
    }
  });

  it("covers every status and priority exactly once", () => {
    // The generated enums are declared in schema order, which is not the order
    // the UI displays, so compare sets rather than sequences.
    assert.deepEqual(
      [...STATUS_ORDER].sort(),
      [...ALL_STATUSES].sort(),
    );
    assert.deepEqual(
      [...PRIORITY_ORDER].sort(),
      [...Object.values(IssuePriority)].sort(),
    );
    assert.equal(new Set(STATUS_ORDER).size, STATUS_ORDER.length);
    assert.equal(new Set(PRIORITY_ORDER).size, PRIORITY_ORDER.length);
  });

  it("shows 1..5 bars from lowest to highest priority", () => {
    const bars = PRIORITY_ORDER.map((p) => PRIORITY_META[p].bars);
    assert.deepEqual(bars, [5, 4, 3, 2, 1]);
  });
});

describe("issueKey", () => {
  it("uses the JIJI prefix", () => {
    assert.equal(ISSUE_KEY_PREFIX, "JIJI");
    assert.equal(issueKey(1), "JIJI-1");
    assert.equal(issueKey(42), "JIJI-42");
    assert.equal(issueKey(1234), "JIJI-1234");
  });
});
