import { test } from "node:test";
import assert from "node:assert/strict";
import { TROPHIES, nearest, won, type TrophyStats } from "@/lib/trophy-defs";
import { en } from "@/lib/i18n/en";

const base: TrophyStats = {
  seen: { movie: 0, tv: 0, album: 0, book: 0 }, genres: [], decades: 0, ratings: 0, voice: 0, posts: 0,
  likesReceived: 0, requests: 0, watchlist: 0, watchlistSeen: 0, nightWatches: 0, activeDays: 0, catalogue: 1000, seenAll: 0,
};
const ids = (s: TrophyStats) => TROPHIES.filter((t) => won(t, s)).map((t) => t.id);

test("a newcomer has nothing, a first film gives its trophy", () => {
  assert.deepEqual(ids(base), []);
  assert.deepEqual(ids({ ...base, seen: { ...base.seen, movie: 1 }, seenAll: 1 }), ["first-movie"]);
});

test("each tier exists, one impossible trophy, ids unique, all translated", () => {
  for (const tier of ["easy", "medium", "hard", "brutal", "impossible"]) assert.ok(TROPHIES.some((t) => t.tier === tier), tier);
  assert.equal(TROPHIES.filter((t) => t.tier === "impossible").length, 1);
  assert.equal(new Set(TROPHIES.map((t) => t.id)).size, TROPHIES.length);
  for (const t of TROPHIES) assert.ok(en[t.name] && en[t.hint], `EN missing for ${t.id}`);
});

test("the impossible one is never awarded, even with everything seen", () => {
  const all = { ...base, catalogue: 10, seenAll: 10 };
  assert.ok(!ids(all).includes("seen-everything"));
});

test("a watchlist counts as finished only with 5 titles or more, all seen", () => {
  const done = (w: number, s: number) => ids({ ...base, watchlist: w, watchlistSeen: s }).includes("watchlist-done");
  assert.ok(!done(3, 3));
  assert.ok(!done(6, 5));
  assert.ok(done(6, 6));
});

test("the hint points at the closest trophy, only once two thirds are done", () => {
  assert.equal(nearest({ ...base, posts: 10 }, new Set()), null);
  assert.equal(nearest({ ...base, posts: 15 }, new Set())?.def.id, "posts-20");
  assert.equal(nearest({ ...base, posts: 15 }, new Set(["posts-20"])), null);
});
