"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { Check, Mic, Square, X, RotateCcw, Star, Lock, SlidersHorizontal } from "lucide-react";
import { getDeepReview, likeByRef, rateByRef, saveDeepReview, setNeverByRef, setSeenByRef } from "@/app/t/actions";
import { CRITERIA, DEEP_UNLOCK, TAGS } from "@/lib/deep";
import { fmtRating } from "@/lib/rating";
import { useT } from "./i18n";
import { Dots } from "./ui";

type Key = string;
type Initial = { liked: Key[]; disliked: Key[]; seen: Key[]; reviewed: Key[]; never: Key[]; ratings: Record<Key, number> };
type Deep = { allowed: boolean; count: number };
type Target = { kind: string; tmdbId: number; name: string };

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
    start(() => likeByRef(t.kind, t.tmdbId, v));
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
    start(() => setSeenByRef(t.kind, t.tmdbId, on));
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
    start(() => rateByRef(t.kind, t.tmdbId, score));
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

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return types.find((x) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(x)) ?? "";
}

/** One star filled from 0 to 1, by halves. */
export function StarShape({ fill, size }: { fill: number; size: number }) {
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <Star size={size} className="absolute inset-0 text-bone/25" />
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
        <Star size={size} className="text-lime" fill="currentColor" />
      </span>
    </span>
  );
}

/**
 * Five stars with halves, Letterboxd style: the left half of a star gives x.5, the right half a full point.
 * Hover previews, clicking the current score clears it.
 */
export function Stars({ value, onChange, size = 22 }: { value: number; onChange: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const t = useT();
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label={t("Note")}>
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.span
          key={n}
          whileTap={{ scale: 0.85 }}
          animate={{ scale: n - 0.5 <= shown ? 1 : 0.88 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
          className="relative block p-0.5"
        >
          <StarShape fill={Math.max(0, Math.min(1, shown - (n - 1)))} size={size} />
          {[n - 0.5, n].map((v, half) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={value === v}
              aria-label={t("{n} sur 5", { n: fmtRating(v) })}
              onMouseEnter={() => setHover(v)}
              onFocus={() => setHover(v)}
              onBlur={() => setHover(0)}
              onClick={() => onChange(v)}
              className={`absolute inset-y-0 w-1/2 ${half ? "right-0" : "left-0"}`}
            />
          ))}
        </motion.span>
      ))}
    </div>
  );
}

/** Quick review from anywhere: a voice note, a few words, or both. */
function ReviewSheet({
  target,
  rating,
  onRate,
  onClose,
  onDone,
  deep,
  onDeep,
}: {
  target: Target | null;
  rating: number;
  onRate: (n: number) => void;
  onClose: () => void;
  onDone: (t: Target) => void;
  deep: Deep;
  onDeep: () => void;
}) {
  const router = useRouter();
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "rec" | "ready" | "sending" | "sent">("idle");
  const [sec, setSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blob = useRef<Blob | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const url = useRef<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!target) return;
    setText("");
    setPhase("idle");
    setSec(0);
    setError(null);
    blob.current = null;
  }, [target]);

  const stopStream = () => {
    clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((tr) => tr.stop());
  };

  const record = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        blob.current = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(blob.current);
        stopStream();
        setPhase("ready");
      };
      r.start(250);
      rec.current = r;
      const t0 = Date.now();
      setSec(0);
      timer.current = setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        setSec(s);
        if (s >= 120) r.stop();
      }, 200);
      setPhase("rec");
    } catch {
      setError(t("Micro bloqué"));
    }
  };

  const send = async () => {
    if (!target || (!blob.current && !text.trim())) return;
    setPhase("sending");
    const fd = new FormData();
    fd.set("kind", target.kind);
    fd.set("tmdbId", String(target.tmdbId));
    fd.set("text", text);
    if (blob.current) {
      fd.set("audio", blob.current, "note");
      fd.set("duration", String(Math.round(sec)));
    }
    const res = await fetch("/api/feedback", { method: "POST", body: fd }).catch(() => null);
    if (!res?.ok) {
      setPhase(blob.current ? "ready" : "idle");
      setError(t("Envoi impossible"));
      return;
    }
    setPhase("sent");
    onDone(target);
    router.refresh();
    setTimeout(onClose, 1100);
  };

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {target && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[90] bg-ink/70 backdrop-blur-sm" />
          <motion.div
            role="dialog"
            aria-label={t("Avis")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-[95] border-t-2 border-lime bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 md:left-auto md:top-0 md:w-[440px] md:border-l-2 md:border-t-0 md:px-8 md:pt-10"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <p className="font-display text-2xl font-semibold leading-tight">{target.name}</p>
              <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
                <X />
              </button>
            </div>

            {phase === "sent" ? (
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid place-items-center py-14">
                <span className="grid size-20 place-items-center rounded-full bg-lime text-ink">
                  <Check size={36} strokeWidth={3} />
                </span>
              </motion.div>
            ) : (
              <div className="space-y-6">
                <Stars value={rating} onChange={(n) => onRate(rating === n ? 0 : n)} size={28} />
                <div className="flex items-center gap-4">
                  {phase === "rec" ? (
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => rec.current?.stop()} aria-label="Stop" className="grid size-16 shrink-0 place-items-center rounded-full bg-coral text-ink">
                      <Square size={22} fill="currentColor" />
                    </motion.button>
                  ) : (
                    <motion.button whileTap={{ scale: 0.9 }} onClick={record} aria-label={t("Note vocale")} className="relative grid size-16 shrink-0 place-items-center rounded-full bg-lime text-ink">
                      {phase === "idle" && <motion.span className="absolute inset-0 rounded-full border-2 border-lime" animate={{ scale: [1, 1.4], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
                      {phase === "ready" ? <RotateCcw size={22} /> : <Mic size={26} />}
                    </motion.button>
                  )}
                  <div className="min-w-0 flex-1">
                    {phase === "rec" && <span className="font-mono tabular-nums text-coral">● {Math.floor(sec / 60)}:{String(Math.floor(sec % 60)).padStart(2, "0")}</span>}
                    {phase === "ready" && url.current && <audio src={url.current} controls className="h-10 w-full" />}
                  </div>
                </div>

                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder={t("Ou en quelques mots")}
                  className="w-full resize-none border-b border-line bg-transparent py-2 text-base outline-none placeholder:text-bone/30 focus:border-lime"
                />
                {error && <p className="text-sm text-coral">{error}</p>}
                {deep.allowed ? (
                  <button onClick={onDeep} className="flex h-11 w-full items-center justify-center gap-2 border border-line text-sm transition-colors hover:border-lime hover:text-lime">
                    <SlidersHorizontal size={16} /> {t("Analyse")}
                  </button>
                ) : (
                  <p className="flex items-center gap-2 font-mono text-xs text-dim" title={t("Analyse")}>
                    <Lock size={13} /> {t("Analyse")} {Math.min(deep.count, DEEP_UNLOCK)}/{DEEP_UNLOCK}
                  </p>
                )}
                <button
                  onClick={send}
                  disabled={phase === "rec" || phase === "sending" || (!blob.current && !text.trim())}
                  className="notch flex h-12 w-full items-center justify-center bg-lime font-semibold text-ink disabled:opacity-40"
                >
                  {phase === "sending" ? <Dots /> : t("Envoyer")}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Detailed review: tap a score per criterion and a few tags. Nothing to type. */
function DeepSheet({ target, onClose, onDone }: { target: Target | null; onClose: () => void; onDone: (t: Target) => void }) {
  const router = useRouter();
  const tr = useT();
  const [mounted, setMounted] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [phase, setPhase] = useState<"load" | "idle" | "sending" | "sent">("load");

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!target) return;
    let stale = false;
    setPhase("load");
    setScores({});
    setTags([]);
    void getDeepReview(target.kind, target.tmdbId).then((r) => {
      if (stale) return;
      if (r) {
        setScores(r.scores);
        setTags(r.tags);
      }
      setPhase("idle");
    });
    return () => {
      stale = true;
    };
  }, [target]);

  const filled = Object.keys(scores).length;
  const save = async () => {
    if (!target || !filled) return;
    setPhase("sending");
    const res = await saveDeepReview(target.kind, target.tmdbId, { scores, tags });
    if (!res.ok) return setPhase("idle");
    setPhase("sent");
    onDone(target);
    router.refresh();
    setTimeout(onClose, 1000);
  };

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {target && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[90] bg-ink/70 backdrop-blur-sm" />
          <motion.div
            role="dialog"
            aria-label={tr("Analyse")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-[95] max-h-[92dvh] overflow-y-auto border-t-2 border-lime bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 md:left-auto md:top-0 md:max-h-none md:w-[520px] md:border-l-2 md:border-t-0 md:px-8 md:pt-10"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-lime">{tr("Analyse")}</p>
                <p className="mt-1 font-display text-2xl font-semibold leading-tight">{target.name}</p>
              </div>
              <button onClick={onClose} aria-label={tr("Fermer")} className="text-dim hover:text-bone">
                <X />
              </button>
            </div>

            {phase === "sent" ? (
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid place-items-center py-14">
                <span className="grid size-20 place-items-center rounded-full bg-lime text-ink">
                  <Check size={36} strokeWidth={3} />
                </span>
              </motion.div>
            ) : phase === "load" ? (
              <div className="grid place-items-center py-14">
                <Dots />
              </div>
            ) : (
              <div className="space-y-7">
                <ul className="space-y-3">
                  {CRITERIA.map((c) => (
                    <li key={c.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <span className="text-sm">{tr(c.label)}</span>
                      <Segments
                        value={scores[c.key] ?? 0}
                        onChange={(n) =>
                          setScores((s) => {
                            const next = { ...s };
                            if (next[c.key] === n) delete next[c.key];
                            else next[c.key] = n;
                            return next;
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {TAGS.map((t) => {
                    const on = tags.includes(t);
                    return (
                      <motion.button
                        key={t}
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setTags((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}
                        className={`border px-3 py-1.5 text-sm transition-colors ${on ? "border-lime bg-lime text-ink" : "border-line text-bone/80 hover:border-bone/40"}`}
                      >
                        {tr(t)}
                      </motion.button>
                    );
                  })}
                </div>
                <button onClick={save} disabled={!filled || phase === "sending"} className="notch flex h-12 w-full items-center justify-center bg-lime font-semibold text-ink disabled:opacity-40">
                  {phase === "sending" ? <Dots /> : tr("Enregistrer")}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Five tappable blocks, from 1 to 5. Tapping the current value clears it. */
function Segments({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useT();
  return (
    <div className="flex gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t("{n} sur 5", { n })}
          whileTap={{ scale: 0.85 }}
          onClick={() => onChange(n)}
          className={`h-8 w-7 transition-colors md:w-8 ${n <= value ? "bg-lime" : "bg-bone/10 hover:bg-bone/20"}`}
        />
      ))}
    </div>
  );
}
