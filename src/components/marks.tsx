"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { Check, Mic, Square, X, RotateCcw, Star } from "lucide-react";
import { likeByRef, rateByRef, setSeenByRef } from "@/app/t/actions";
import { Dots } from "./ui";

type Key = string;
type Initial = { liked: Key[]; disliked: Key[]; seen: Key[]; reviewed: Key[]; ratings: Record<Key, number> };
type Target = { kind: string; tmdbId: number; name: string };

type Ctx = {
  liked: Set<Key>;
  disliked: Set<Key>;
  seen: Set<Key>;
  reviewed: Set<Key>;
  ratings: Map<Key, number>;
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
export function MarksProvider({ initial, children }: { initial: Initial; children: React.ReactNode }) {
  const [liked, setLiked] = useState(() => new Set(initial.liked));
  const [disliked, setDisliked] = useState(() => new Set(initial.disliked));
  const [seen, setSeenSet] = useState(() => new Set(initial.seen));
  const [reviewed, setReviewed] = useState(() => new Set(initial.reviewed));
  const [ratings, setRatings] = useState(() => new Map(Object.entries(initial.ratings)));
  const [target, setTarget] = useState<Target | null>(null);
  const [, start] = useTransition();

  const setLike = useCallback((t: Target, v: 1 | -1 | 0) => {
    const k = keyOf(t);
    setLiked((s) => withKey(s, k, v === 1));
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

  const onReviewed = useCallback((t: Target) => {
    const k = keyOf(t);
    setReviewed((s) => withKey(s, k, true));
    setSeenSet((s) => withKey(s, k, true));
  }, []);

  const value = useMemo(
    () => ({ liked, disliked, seen, reviewed, ratings, setLike, setSeen, setRating, review: setTarget }),
    [liked, disliked, seen, reviewed, ratings, setLike, setSeen, setRating],
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
      />
    </MarksCtx.Provider>
  );
}

/** Raw sets, for lists that follow the marks live (profile tabs). */
export function useMarkSets() {
  const ctx = useContext(MarksCtx);
  return { liked: ctx?.liked ?? new Set<Key>(), seen: ctx?.seen ?? new Set<Key>(), has: (s: Set<Key>, t: { kind: string; tmdbId: number }) => s.has(keyOf(t)) };
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

/** Five stars. Hover previews, clicking the current score clears it. */
export function Stars({ value, onChange, size = 22 }: { value: number; onChange: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Note">
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} sur 5`}
          whileTap={{ scale: 0.8 }}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <motion.span animate={{ scale: n <= shown ? 1 : 0.85 }} transition={{ type: "spring", stiffness: 500, damping: 20 }} className="block">
            <Star size={size} className={n <= shown ? "text-lime" : "text-bone/25"} fill={n <= shown ? "currentColor" : "none"} />
          </motion.span>
        </motion.button>
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
}: {
  target: Target | null;
  rating: number;
  onRate: (n: number) => void;
  onClose: () => void;
  onDone: (t: Target) => void;
}) {
  const router = useRouter();
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
      setError("Micro bloqué");
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
      setError("Envoi impossible");
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
            aria-label="Avis"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-[95] border-t-2 border-lime bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 md:left-auto md:top-0 md:w-[440px] md:border-l-2 md:border-t-0 md:px-8 md:pt-10"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <p className="font-display text-2xl font-semibold leading-tight">{target.name}</p>
              <button onClick={onClose} aria-label="Fermer" className="text-dim hover:text-bone">
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
                    <motion.button whileTap={{ scale: 0.9 }} onClick={record} aria-label="Note vocale" className="relative grid size-16 shrink-0 place-items-center rounded-full bg-lime text-ink">
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
                  placeholder="Ou en quelques mots"
                  className="w-full resize-none border-b border-line bg-transparent py-2 text-base outline-none placeholder:text-bone/30 focus:border-lime"
                />
                {error && <p className="text-sm text-coral">{error}</p>}
                <button
                  onClick={send}
                  disabled={phase === "rec" || phase === "sending" || (!blob.current && !text.trim())}
                  className="notch flex h-12 w-full items-center justify-center bg-lime font-semibold text-ink disabled:opacity-40"
                >
                  {phase === "sending" ? <Dots /> : "Envoyer"}
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
