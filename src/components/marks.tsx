"use client";
import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { likeByRef, rateByRef, setNeverByRef, setSeenByRef } from "@/app/t/actions";
import { DEEP_UNLOCK } from "@/lib/deep";
import { ReviewSheet } from "./review-sheet";
import { DeepSheet } from "./deep-sheet";
import { progressed } from "./trophies";

type Key = string;
type Initial = { liked: Key[]; disliked: Key[]; seen: Key[]; reviewed: Key[]; never: Key[]; ratings: Record<Key, number> };
export type Deep = { allowed: boolean; count: number };
export type Target = { kind: string; tmdbId: number; name: string };

type Ctx = {
  liked: Set<Key>;
  disliked: Set<Key>;
  seen: Set<Key>;
  reviewed: Set<Key>;
  ratings: Map<Key, number>;
  never: Set<Key>;
  deep: Deep;
  setNever: (t: Target, on: boolean) => void;
  analyse: (t: Target) => void;
  setLike: (t: Target, v: 1 | -1 | 0) => void;
  setRating: (t: Target, score: number) => void;
  setSeen: (t: Target, on: boolean) => void;
  review: (t: Target) => void;
};

const MarksCtx = createContext<Ctx | null>(null);
const keyOf = (t: { kind: string; tmdbId: number }) => `${t.kind}:${t.tmdbId}`;
const withKey = (s: Set<Key>, k: Key, on: boolean) => {
  const n = new Set(s);
  if (on) n.add(k);
  else n.delete(k);
  return n;
};

/** Holds the member's likes, seen titles and reviews so every poster can show and change them instantly. */
export function MarksProvider({ initial, deep: deepInit, children }: { initial: Initial; deep: Deep; children: React.ReactNode }) {
  const [liked, setLiked] = useState(() => new Set(initial.liked));
  const [disliked, setDisliked] = useState(() => new Set(initial.disliked));
  const [seen, setSeenSet] = useState(() => new Set(initial.seen));
  const [reviewed, setReviewed] = useState(() => new Set(initial.reviewed));
  const [ratings, setRatings] = useState(() => new Map(Object.entries(initial.ratings)));
  const [never, setNeverSet] = useState(() => new Set(initial.never));
  const [deep, setDeep] = useState(deepInit);
  const [target, setTarget] = useState<Target | null>(null);
  const [deepTarget, setDeepTarget] = useState<Target | null>(null);
  const [, start] = useTransition();

  const setLike = useCallback((t: Target, v: 1 | -1 | 0) => {
    const k = keyOf(t);
    setLiked((s) => withKey(s, k, v === 1));
    if (v === 1) setNeverSet((s) => withKey(s, k, false));
    setDisliked((s) => withKey(s, k, v === -1));
    if (v !== 0) setSeenSet((s) => withKey(s, k, true));
    start(async () => {
      await likeByRef(t.kind, t.tmdbId, v);
      progressed();
    });
  }, []);

  const setSeen = useCallback((t: Target, on: boolean) => {
    const k = keyOf(t);
    setSeenSet((s) => withKey(s, k, on));
    if (!on) {
      setLiked((s) => withKey(s, k, false));
      setDisliked((s) => withKey(s, k, false));
      setRatings((m) => {
        const n = new Map(m);
        n.delete(k);
        return n;
      });
    }
    start(async () => {
      await setSeenByRef(t.kind, t.tmdbId, on);
      progressed();
    });
  }, []);

  const setRating = useCallback((t: Target, score: number) => {
    const k = keyOf(t);
    setRatings((m) => {
      const n = new Map(m);
      if (score > 0) n.set(k, score);
      else n.delete(k);
      return n;
    });
    if (score > 0) setSeenSet((s) => withKey(s, k, true));
    start(async () => {
      await rateByRef(t.kind, t.tmdbId, score);
      progressed();
    });
  }, []);

  const setNever = useCallback((t: Target, on: boolean) => {
    const k = keyOf(t);
    setNeverSet((s) => withKey(s, k, on));
    if (on) setLiked((s) => withKey(s, k, false));
    start(() => setNeverByRef(t.kind, t.tmdbId, on));
  }, []);

  const onReviewed = useCallback((t: Target) => {
    const k = keyOf(t);
    setDeep((d) => ({ count: d.count + 1, allowed: d.allowed || d.count + 1 >= DEEP_UNLOCK }));
    setReviewed((s) => withKey(s, k, true));
    setSeenSet((s) => withKey(s, k, true));
    progressed();
  }, []);

  const value = useMemo(
    () => ({ liked, disliked, seen, reviewed, ratings, never, deep, setNever, analyse: setDeepTarget, setLike, setSeen, setRating, review: setTarget }),
    [liked, disliked, seen, reviewed, ratings, never, deep, setNever, setLike, setSeen, setRating],
  );

  return (
    <MarksCtx.Provider value={value}>
      {children}
      <ReviewSheet
        target={target}
        rating={target ? ratings.get(keyOf(target)) ?? 0 : 0}
        onRate={(n) => target && setRating(target, n)}
        onClose={() => setTarget(null)}
        onDone={onReviewed}
        deep={deep}
        onDeep={() => {
          setDeepTarget(target);
          setTarget(null);
        }}
      />
      <DeepSheet target={deepTarget} onClose={() => setDeepTarget(null)} onDone={(t) => setSeenSet((s) => withKey(s, keyOf(t), true))} />
    </MarksCtx.Provider>
  );
}

/** Raw sets, for lists that follow the marks live (profile tabs). */
export function useMarkSets() {
  const ctx = useContext(MarksCtx);
  return { liked: ctx?.liked ?? new Set<Key>(), seen: ctx?.seen ?? new Set<Key>(), never: ctx?.never ?? new Set<Key>(), has: (s: Set<Key>, t: { kind: string; tmdbId: number }) => s.has(keyOf(t)) };
}

/** Marks for one title, or null outside the provider (signed-out pages). */
export function useMark(t: { kind: string; tmdbId: number; name: string }) {
  const ctx = useContext(MarksCtx);
  if (!ctx) return null;
  const k = keyOf(t);
  return {
    liked: ctx.liked.has(k),
    disliked: ctx.disliked.has(k),
    seen: ctx.seen.has(k),
    reviewed: ctx.reviewed.has(k),
    never: ctx.never.has(k),
    deep: ctx.deep.allowed,
    toggleNever: () => ctx.setNever(t, !ctx.never.has(k)),
    analyse: () => ctx.analyse(t),
    rating: ctx.ratings.get(k) ?? 0,
    rate: (n: number) => ctx.setRating(t, ctx.ratings.get(k) === n ? 0 : n),
    toggleLike: () => ctx.setLike(t, ctx.liked.has(k) ? 0 : 1),
    toggleDislike: () => ctx.setLike(t, ctx.disliked.has(k) ? 0 : -1),
    toggleSeen: () => ctx.setSeen(t, !ctx.seen.has(k)),
    review: () => ctx.review(t),
  };
}

export { StarShape, Stars } from "./stars";
