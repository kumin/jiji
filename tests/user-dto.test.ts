import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toUserDTO } from "@/lib/issue-service";

describe("toUserDTO", () => {
  it("copies the role onto the DTO", () => {
    const dto = toUserDTO({
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      color: "#000000",
      image: null,
      role: "VIEWER",
    });
    assert.equal(dto?.role, "VIEWER");
  });
});
