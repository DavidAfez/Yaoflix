import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.DATA_ENC_KEY ||= randomBytes(32).toString("base64");
process.env.HASH_PEPPER ||= randomBytes(32).toString("base64");

const { safeNext } = await import("@/lib/safe-next");
const { encrypt, decrypt, blindIndex, safeEqual } = await import("@/lib/crypto");
const { clientIp } = await import("@/lib/context");
const { can } = await import("@/lib/rbac");
const { rateLimit } = await import("@/lib/ratelimit");

test("after sign-in, only paths of this site", () => {
  for (const ok of ["/", "/feed", "/t/movie/12?x=1#y"]) assert.equal(safeNext(ok), ok);
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/a b", "/x\u0000", ""]) assert.equal(safeNext(bad), "/");
});

test("emails are encrypted, never stored as is, and still found by their blind index", () => {
  const a = encrypt("membre@exemple.fr");
  assert.notEqual(a, encrypt("membre@exemple.fr"), "a fresh IV each time");
  assert.ok(!a.includes("membre"));
  assert.equal(decrypt(a), "membre@exemple.fr");
  assert.equal(blindIndex("membre@exemple.fr", "email"), blindIndex("membre@exemple.fr", "email"));
  assert.notEqual(blindIndex("membre@exemple.fr", "email"), blindIndex("membre@exemple.fr", "phone"));
});

test("a tampered ciphertext is refused", () => {
  const parts = encrypt("secret").split(".");
  parts[3] = Buffer.from("other").toString("base64url");
  assert.throws(() => decrypt(parts.join(".")));
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
});

test("the client IP only comes from headers the setup can trust", () => {
  const h = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2", "cf-connecting-ip": "9.9.9.9" });
  const env = { ...process.env };
  try {
    delete process.env.TRUST_PROXY;
    process.env.APP_URL = "http://localhost:3000";
    assert.equal(clientIp(h), "1.1.1.1");
    process.env.TRUST_PROXY = "proxy";
    assert.equal(clientIp(h), "2.2.2.2", "the address our own proxy appended");
    process.env.TRUST_PROXY = "";
    process.env.APP_URL = "https://site.example";
    assert.equal(clientIp(h), "9.9.9.9", "behind Cloudflare");
    assert.equal(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6" })), null, "a forged XFF is ignored online");
  } finally {
    process.env = env;
  }
});

test("roles stack up, and only DEV purges", () => {
  assert.ok(!can.upload("USER"));
  assert.ok(can.upload("UPLOADER"));
  assert.ok(!can.manageUsers("UPLOADER"));
  assert.ok(can.manageUsers("MODERATOR"));
  assert.ok(!can.purgeErrors("MODERATOR"));
  assert.ok(can.purgeErrors("DEV"));
});

test("the rate limiter lets a burst through, then says no", () => {
  const key = `test:${Math.random()}`;
  assert.deepEqual([1, 2, 3].map(() => rateLimit(key, 2, 60)), [true, true, false]);
});
