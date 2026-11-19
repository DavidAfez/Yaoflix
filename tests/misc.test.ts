import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSong, timecode } from "@/lib/notes";
import { isKind, coverAspect, seenLabels } from "@/lib/kinds";

test("a song line gives title, artist and time", () => {
  assert.deepEqual(parseSong("Yéké Yéké – Mory Kanté – 1:02:03"), { kind: "song", body: "Yéké Yéké", artist: "Mory Kanté", atSec: 3723 });
  assert.deepEqual(parseSong("Pata Pata - 12:05"), { kind: "song", body: "Pata Pata", artist: null, atSec: 725 });
  assert.equal(parseSong("   "), null);
});

test("timecodes", () => {
  assert.equal(timecode(65), "1:05");
  assert.equal(timecode(3723), "1:02:03");
});

test("shelves", () => {
  assert.ok(isKind("book"));
  assert.ok(!isKind("game"));
  assert.equal(coverAspect("album"), "aspect-square");
  assert.equal(seenLabels("book").done, "Lu");
});
