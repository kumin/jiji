import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAdminEmail, parseAdminEmails } from "@/lib/admin-emails";

describe("parseAdminEmails", () => {
  it("trims, lower-cases and drops blanks", () => {
    assert.deepEqual(parseAdminEmails(" A@x.com, b@y.com ,,"), ["a@x.com", "b@y.com"]);
  });

  it("is empty when unset or blank", () => {
    assert.deepEqual(parseAdminEmails(undefined), []);
    assert.deepEqual(parseAdminEmails("  "), []);
  });
});

describe("isAdminEmail", () => {
  const list = ["a@x.com"];

  it("matches regardless of case", () => {
    assert.equal(isAdminEmail("a@X.com", list), true);
  });

  it("rejects other and missing emails", () => {
    assert.equal(isAdminEmail("b@x.com", list), false);
    assert.equal(isAdminEmail(null, list), false);
    assert.equal(isAdminEmail(undefined, list), false);
  });
});
