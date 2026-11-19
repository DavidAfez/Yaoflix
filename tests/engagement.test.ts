import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { group, twoProportionP } from "@/lib/engagement";

test("a member always lands in the same group, and about 10 % are held out", () => {
  const id = randomUUID();
  assert.equal(group(id, 10), group(id, 10));
  const n = 20_000;
  const out = Array.from({ length: n }, () => group(randomUUID(), 10)).filter((g) => g === "holdout").length;
  assert.ok(Math.abs(out / n - 0.1) < 0.01, `${out / n}`);
  assert.equal(group(id, 0), "test");
});

test("the p-value sees a real gap and ignores noise", () => {
  assert.ok(twoProportionP(80, 100, 40, 100)! < 0.001);
  assert.ok(twoProportionP(50, 100, 48, 100)! > 0.5);
  assert.equal(twoProportionP(1, 0, 1, 10), null);
});
