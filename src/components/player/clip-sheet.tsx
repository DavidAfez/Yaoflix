"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Play, X } from "lucide-react";
import { Dots } from "../ui";
import { useT } from "../i18n";

const LENGTHS = [5, 10, 15];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Cut up to 15 seconds around the current moment and post it.
 * The start slider covers the 60 seconds before the pause point and the 15 after.
 */
export function ClipSheet({
  grantId,
  video,
  title,
  onClose,
  onDone,
}: {
  grantId: string;
  video: React.RefObject<HTMLVideoElement | null>;
  title: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const v = video.current;
  const now = v?.currentTime ?? 0;
  const total = v?.duration || now + 15;
  const lo = Math.max(0, now - 60);
  const hi = Math.max(lo, Math.min(total - 1, now + 15));
  const [start, setStart] = useState(Math.max(lo, now - 10));
  const [len, setLen] = useState(10);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopAt = useRef<number | null>(null);

  // Preview: play the selection once, then pause
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const onTime = () => {
      if (stopAt.current !== null && el.currentTime >= stopAt.current) {
        el.pause();
        stopAt.current = null;
      }
    };
    el.addEventListener("timeupdate", onTime);
    return () => el.removeEventListener("timeupdate", onTime);
  }, [video]);

  const preview = () => {
    const el = video.current;
    if (!el) return;
    el.currentTime = start;
    stopAt.current = start + len;
    void el.play().catch(() => {});
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/clips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId, kind: "video", start, end: start + len, text, post: true }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: string } | null;
      return setError(t(data?.error ?? "Envoi impossible"));
    }
    onDone();
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
      className="absolute inset-x-0 bottom-0 z-20 border-t-2 border-lime bg-ink/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur md:inset-x-auto md:right-6 md:bottom-6 md:w-[420px] md:border-l-2 md:border-t-0 md:p-6"
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="truncate font-display text-lg font-semibold">
          {t("Clip")} <span className="font-mono text-xs font-normal text-dim">{title}</span>
        </p>
        <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
          <X size={20} />
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between font-mono text-xs tabular-nums">
        <span>{fmt(start)}</span>
        <span className="text-lime">{len} s</span>
        <span>{fmt(start + len)}</span>
      </div>
      <input
        type="range"
        min={lo}
        max={hi}
        step={0.5}
        value={start}
        onChange={(e) => setStart(Number(e.target.value))}
        aria-label={t("Début du clip")}
        className="w-full accent-[var(--color-lime)]"
      />
      <div className="mt-3 flex items-center gap-2">
        {LENGTHS.map((l) => (
          <button key={l} onClick={() => setLen(l)} className={`h-9 px-3 font-mono text-xs transition-colors ${len === l ? "bg-lime text-ink" : "border border-line hover:border-bone/40"}`}>
            {l} s
          </button>
        ))}
        <button onClick={preview} className="ml-auto flex h-9 items-center gap-2 border border-line px-3 text-sm hover:border-lime hover:text-lime">
          <Play size={14} fill="currentColor" /> {t("Aperçu")}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder={t("Ton commentaire")}
        className="mt-4 w-full resize-none border-b border-line bg-transparent py-2 outline-none placeholder:text-bone/30 focus:border-lime"
      />
      {error && <p className="mt-2 text-sm text-coral">{error}</p>}
      <button onClick={send} disabled={busy} className="notch mt-4 flex h-11 w-full items-center justify-center bg-lime font-semibold text-ink disabled:opacity-40">
        {busy ? <Dots /> : t("Publier")}
      </button>
    </motion.div>
  );
}
