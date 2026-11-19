import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { en } from "@/lib/i18n/en";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

// Every literal passed to t("…") must have its English version, or the EN interface shows French
test("every interface string has its English version", () => {
  const missing = new Set<string>();
  for (const f of files("src")) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)+)"/g)) {
      const key = JSON.parse(`"${m[1]}"`) as string;
      if (!(key in en)) missing.add(`${key}  (${f})`);
    }
  }
  assert.deepEqual([...missing], []);
});
