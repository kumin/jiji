import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAllowedEmail, parseAllowedDomains } from "@/lib/email-domain";

describe("parseAllowedDomains", () => {
  it("is empty for missing or blank configuration", () => {
    for (const value of [undefined, "", "   ", ",", " , , "]) {
      assert.deepEqual(parseAllowedDomains(value), [], JSON.stringify(value));
    }
  });

  it("trims, lowercases and drops a leading @", () => {
    assert.deepEqual(parseAllowedDomains(" Gmail.COM "), ["gmail.com"]);
    assert.deepEqual(parseAllowedDomains("@acme.com"), ["acme.com"]);
  });

  it("splits a list and discards blank entries", () => {
    assert.deepEqual(parseAllowedDomains("gmail.com, acme.com ,, "), [
      "gmail.com",
      "acme.com",
    ]);
  });
});

describe("isAllowedEmail", () => {
  const gmailOnly = parseAllowedDomains("gmail.com");
  const twoDomains = parseAllowedDomains("gmail.com,acme.com");

  it("allows any address when the allowlist is empty", () => {
    assert.equal(isAllowedEmail("anyone@anywhere.test", []), true);
    assert.equal(isAllowedEmail("a@gmail.com", []), true);
  });

  it("matches the exact domain", () => {
    assert.equal(isAllowedEmail("a@gmail.com", gmailOnly), true);
    assert.equal(isAllowedEmail("a@acme.com", gmailOnly), false);
    assert.equal(isAllowedEmail("a@acme.com", twoDomains), true);
  });

  it("is case-insensitive on the domain", () => {
    assert.equal(isAllowedEmail("a@GMail.COM", gmailOnly), true);
  });

  it("rejects a subdomain, which is a different domain", () => {
    assert.equal(isAllowedEmail("a@mail.gmail.com", gmailOnly), false);
  });

  it("takes the domain after the last @ so a crafted address cannot slip through", () => {
    // Without lastIndexOf("@") this resolves to "gmail.com" and would pass.
    assert.equal(isAllowedEmail("a@gmail.com@evil.test", gmailOnly), false);
  });

  it("rejects malformed addresses", () => {
    for (const email of [null, undefined, "", "@gmail.com", "a@", "gmail.com", "@"]) {
      assert.equal(isAllowedEmail(email, gmailOnly), false, JSON.stringify(email));
    }
  });
});
