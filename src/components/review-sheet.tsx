"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { Check, Mic, Square, X, RotateCcw, Lock, SlidersHorizontal } from "lucide-react";
import { DEEP_UNLOCK } from "@/lib/deep";
import { useT } from "./i18n";
import { Dots } from "./ui";
import { Stars } from "./stars";
import { pickMime } from "@/lib/audio";
import type { Deep, Target } from "./marks";

/** Quick review from anywhere: a voice note, a few words, or both. */
export function ReviewSheet({
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
  const [audio, setAudio] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  // The previous take is freed when a new one replaces it, and when the sheet goes away
  useEffect(() => () => void (audio && URL.revokeObjectURL(audio)), [audio]);
  useEffect(() => {
    if (!target) return;
    setText("");
    setPhase("idle");
    setSec(0);
    setError(null);
    blob.current = null;
    setAudio(null);
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
        setAudio(URL.createObjectURL(blob.current));
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
                    {phase === "ready" && audio && <audio src={audio} controls className="h-10 w-full" />}
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
                  disabled={phase === "rec" || phase === "sending" || (!audio && !text.trim())}
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
