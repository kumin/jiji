import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  expiresAtFrom,
  generateToken,
  hashToken,
  isExpired,
  parseBearer,
  tokenPrefix,
} from "@/lib/api-tokens";

describe("generateToken", () => {
  it("is jiji_ plus 32 random bytes in base64url", () => {
    const token = generateToken();
    assert.match(token, /^jiji_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(generateToken(), token);
  });
});

describe("hashToken", () => {
  it("is a stable SHA-256 hex digest", () => {
    const hash = hashToken("jiji_abc");
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hashToken("jiji_abc"), hash);
    assert.notEqual(hashToken("jiji_abd"), hash);
  });
});

describe("tokenPrefix", () => {
  it("keeps the first 9 characters", () => {
    assert.equal(tokenPrefix("jiji_Ab3xyz123"), "jiji_Ab3x");
  });
});

describe("parseBearer", () => {
  it("reads a jiji token from a Bearer header", () => {
    assert.equal(parseBearer("Bearer jiji_x"), "jiji_x");
    assert.equal(parseBearer("bearer jiji_x"), "jiji_x");
    assert.equal(parseBearer("  Bearer   jiji_x  "), "jiji_x");
  });

  it("rejects anything else", () => {
    for (const header of [null, undefined, "", "Basic abc", "Bearer", "Bearer ", "Bearer abc"]) {
      assert.equal(parseBearer(header), null, String(header));
    }
  });
});

describe("expiry", () => {
  const now = new Date("2026-11-24T10:00:00.000Z");

  it("adds whole days", () => {
    assert.equal(expiresAtFrom(now, 30).toISOString(), "2026-12-24T10:00:00.000Z");
    assert.equal(expiresAtFrom(now, 7).toISOString(), "2026-12-01T10:00:00.000Z");
  });

  it("treats the expiry instant itself as expired", () => {
    assert.equal(isExpired({ expiresAt: new Date(now.getTime() + 1) }, now), false);
    assert.equal(isExpired({ expiresAt: now }, now), true);
    assert.equal(isExpired({ expiresAt: new Date(now.getTime() - 1) }, now), true);
  });
});
