import { test } from "node:test";
import assert from "node:assert/strict";
import { splitTags, tagAtCaret, tagsOf } from "@/lib/hashtags";

test("finds tags with accents, once, in lower case", () => {
  assert.deepEqual(tagsOf("Revu #CinéAfricain hier #cinéafricain #2024 et #sembène"), ["cinéafricain", "2024", "sembène"]);
});

test("ignores what only looks like a tag", () => {
  assert.deepEqual(tagsOf("du C# page#2 ##double #a"), []);
  assert.deepEqual(tagsOf(null), []);
});

test("cuts the text around the tags without losing a character", () => {
  const text = "Vu #LaNoireDe, puis #Borom_Sarret.";
  const parts = splitTags(text);
  assert.equal(parts.map((p) => ("tag" in p ? p.raw : p.text)).join(""), text);
  assert.deepEqual(parts.filter((p) => "tag" in p).map((p) => ("tag" in p ? p.tag : "")), ["lanoirede", "borom_sarret"]);
});

test("knows the tag being typed", () => {
  assert.equal(tagAtCaret("j'adore #cin", 12), "cin");
  assert.equal(tagAtCaret("j'adore #", 9), "");
  assert.equal(tagAtCaret("j'adore #cin suite", 18), null);
  assert.equal(tagAtCaret("du C#x", 6), null, "glued to a word");
});
