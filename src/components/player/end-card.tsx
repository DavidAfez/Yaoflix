"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Mic, RotateCcw, Square, ThumbsDown, ThumbsUp, Send, X } from "lucide-react";
import Link from "next/link";
import { setLike } from "@/app/t/actions";
import { Dots } from "../ui";

const MAX_SEC = 120;
const BARS = 28;

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

type Phase = "idle" | "rec" | "review" | "sending" | "sent";

export function EndCard({ titleId, title, onReplay }: { titleId: number; title: string; onReplay: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [levels, setLevels] = useState<number[]>(Array(BARS).fill(0.08));
  const [sec, setSec] = useState(0);
  const [vote, setVote] = useState<0 | 1 | -1>(0);
  const [denied, setDenied] = useState(false);
  const [hidden, setHidden] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blob = useRef<Blob | null>(null);
  const url = useRef<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);
  const started = useRef(0);

  const cleanup = () => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => {
    cleanup();
    if (url.current) URL.revokeObjectURL(url.current);
  }, []);

  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mime = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        blob.current = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(blob.current);
        cleanup();
        setPhase("review");
      };
      r.start(250);
      rec.current = r;
      started.current = Date.now();
      setPhase("rec");

      // Live waveform
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 64;
      ctx.createMediaStreamSource(s).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        an.getByteFrequencyData(data);
        setLevels(Array.from({ length: BARS }, (_, i) => Math.max(0.08, (data[i % data.length] ?? 0) / 255)));
        const elapsed = (Date.now() - started.current) / 1000;
        setSec(elapsed);
        if (elapsed >= MAX_SEC) stop();
        else raf.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      setDenied(true);
    }
  };

  const stop = () => {
    if (rec.current?.state === "recording") rec.current.stop();
  };

  const send = async () => {
    if (!blob.current) return;
    setPhase("sending");
    const fd = new FormData();
    fd.set("audio", blob.current, "note");
    fd.set("titleId", String(titleId));
    fd.set("duration", String(Math.round(sec)));
    const res = await fetch("/api/feedback", { method: "POST", body: fd }).catch(() => null);
    setPhase(res?.ok ? "sent" : "review");
  };

  const pickVote = (v: 1 | -1) => {
    const next = vote === v ? 0 : v;
    setVote(next);
    void setLike(titleId, next);
  };

  if (hidden) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-10 bg-ink/85 px-6 backdrop-blur-md"
    >
      <button onClick={() => setHidden(true)} aria-label="Fermer" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid size-11 place-items-center text-dim hover:text-bone md:right-8 md:top-8">
        <X />
      </button>

      <motion.p initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-center font-display text-5xl font-extrabold tracking-tight md:text-7xl">
        Alors ?
      </motion.p>
      <p className="-mt-6 max-w-md truncate text-center font-mono text-xs uppercase tracking-widest text-bone/60">{title}</p>

      <div className="flex h-44 flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.button
              key="idle"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              whileTap={{ scale: 0.9 }}
              onClick={start}
              aria-label="Note vocale"
              className="relative grid size-28 place-items-center rounded-full bg-lime text-ink"
            >
              <motion.span className="absolute inset-0 rounded-full border-2 border-lime" animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />
              <Mic size={40} />
            </motion.button>
          )}
          {phase === "rec" && (
            <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-6">
              <div className="flex h-20 items-center gap-1">
                {levels.map((l, i) => (
                  <motion.span key={i} className="w-1.5 bg-lime" animate={{ height: `${l * 100}%` }} transition={{ duration: 0.08 }} />
                ))}
              </div>
              <div className="flex items-center gap-6">
                <span className="font-mono tabular-nums text-coral">● {Math.floor(sec / 60)}:{String(Math.floor(sec % 60)).padStart(2, "0")}</span>
                <motion.button whileTap={{ scale: 0.9 }} onClick={stop} aria-label="Stop" className="grid size-16 place-items-center rounded-full bg-coral text-ink">
                  <Square size={22} fill="currentColor" />
                </motion.button>
              </div>
            </motion.div>
          )}
          {(phase === "review" || phase === "sending") && (
            <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5">
              {url.current && <audio src={url.current} controls className="w-72" />}
              <div className="flex gap-3">
                <button onClick={() => setPhase("idle")} aria-label="Refaire" className="grid size-14 place-items-center border border-line hover:border-bone/40">
                  <RotateCcw size={20} />
                </button>
                <button onClick={send} disabled={phase === "sending"} className="notch flex h-14 items-center gap-2 bg-lime px-8 font-semibold text-ink">
                  {phase === "sending" ? <Dots /> : <><Send size={18} /> Envoyer</>}
                </button>
              </div>
            </motion.div>
          )}
          {phase === "sent" && (
            <motion.div key="sent" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 220, damping: 13 }} className="grid size-28 place-items-center rounded-full bg-lime text-ink">
              <Check size={48} strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
        {denied && phase === "idle" && <p className="mt-4 text-sm text-coral">Micro bloqué</p>}
      </div>

      <div className="flex items-center gap-3">
        <VoteBtn on={vote === 1} onClick={() => pickVote(1)} label="J'aime">
          <ThumbsUp size={22} />
        </VoteBtn>
        <VoteBtn on={vote === -1} onClick={() => pickVote(-1)} label="Bof" tone="coral">
          <ThumbsDown size={22} />
        </VoteBtn>
      </div>

      <div className="flex gap-8 text-sm">
        <button onClick={onReplay} className="text-bone/70 underline-offset-4 hover:text-bone hover:underline">
          Revoir
        </button>
        <Link href="/" className="text-bone/70 underline-offset-4 hover:text-bone hover:underline">
          Accueil
        </Link>
      </div>
    </motion.div>
  );
}

function VoteBtn({ on, onClick, label, children, tone = "lime" }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode; tone?: "lime" | "coral" }) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`grid size-16 place-items-center border-2 transition-colors ${on ? (tone === "lime" ? "border-lime bg-lime text-ink" : "border-coral bg-coral text-ink") : "border-line text-bone"}`}
    >
      {children}
    </motion.button>
  );
}
