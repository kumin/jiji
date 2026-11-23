import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type Action, type Actor, can, denyReason } from "@/lib/permissions";

const admin: Actor = { id: "a", role: "ADMIN" };
const member: Actor = { id: "m", role: "MEMBER" };
const viewer: Actor = { id: "v", role: "VIEWER" };

const own = { reporterId: "m" };
const others = { reporterId: "someone-else" };
const orphan = { reporterId: null };

type Row = [string, Action, { reporterId: string | null } | undefined, boolean, boolean, boolean];

// [label, action, issue, viewer, member, admin], one row per cell of the spec's table.
const TABLE: Row[] = [
  ["create an issue", "issue:create", undefined, false, true, true],
  ["edit an issue", "issue:edit", others, false, true, true],
  ["delete own issue", "issue:delete", own, false, true, true],
  ["delete someone else's issue", "issue:delete", others, false, false, true],
  ["delete an issue with no reporter", "issue:delete", orphan, false, false, true],
  ["delete without an issue", "issue:delete", undefined, false, false, true],
  ["manage dashboards", "dashboard:manage", undefined, false, false, true],
  ["change roles", "user:manageRoles", undefined, false, false, true],
];

describe("can()", () => {
  for (const [label, action, issue, v, m, a] of TABLE) {
    it(`${label}: viewer ${v}, member ${m}, admin ${a}`, () => {
      assert.equal(can(viewer, action, issue), v, "viewer");
      assert.equal(can(member, action, issue), m, "member");
      assert.equal(can(admin, action, issue), a, "admin");
    });
  }

  it("a viewer's own issue is still not deletable", () => {
    assert.equal(can(viewer, "issue:delete", { reporterId: "v" }), false);
  });
});

describe("denyReason()", () => {
  it("gives a reason exactly when can() is false", () => {
    for (const [, action, issue] of TABLE) {
      for (const actor of [viewer, member, admin]) {
        const reason = denyReason(actor, action, issue);
        if (can(actor, action, issue)) assert.equal(reason, null);
        else assert.ok(reason && reason.length > 0, `${actor.role} ${action}`);
      }
    }
  });

  it("explains the member delete rule", () => {
    assert.equal(
      denyReason(member, "issue:delete", others),
      "Members can only delete issues they reported",
    );
    assert.equal(denyReason(viewer, "issue:edit"), "Viewers can't edit issues");
  });
});
