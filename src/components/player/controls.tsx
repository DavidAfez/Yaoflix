"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useT } from "../i18n";

export type Thumbs = { every: number; w: number; h: number; grid: number; count: number };

export const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

export const qLabel = (h: number) => (h >= 2000 ? "4K" : `${h}p`);

/** A faint @handle that drifts across the frame: a screen recording names who made it. */
export function Watermark({ handle }: { handle: string }) {
  const [pos, setPos] = useState({ x: 12, y: 18 });
  useEffect(() => {
    const id = setInterval(() => setPos({ x: 6 + Math.random() * 70, y: 10 + Math.random() * 70 }), 45_000);
    return () => clearInterval(id);
  }, []);
  return (
    <motion.span
      aria-hidden
      animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      transition={{ duration: 6, ease: "easeInOut" }}
      className="pointer-events-none absolute select-none font-mono text-[11px] tracking-widest text-bone/[0.12]"
    >
      @{handle}
    </motion.span>
  );
}

export function CtrlBtn({ children, label, onClick, on, className = "" }: { children: React.ReactNode; label: string; onClick: () => void; on?: boolean; className?: string }) {
  const t = useT();
  label = t(label);
  return (
    <motion.button whileTap={{ scale: 0.85 }} onClick={onClick} aria-label={label} title={label} className={`grid size-11 place-items-center transition-colors ${on ? "text-lime" : "text-bone hover:text-lime"} ${className}`}>
      {children}
    </motion.button>
  );
}

export function MenuItem({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-bone/5 ${on ? "text-lime" : "text-bone"}`}>
      {children}
    </button>
  );
}

/** Hover card above the seek bar: the frame at that moment (when previews exist) and the time. */
export function Preview({ ratio, duration, thumbs, grantId }: { ratio: number; duration: number; thumbs: Thumbs | null; grantId: string }) {
  const at = ratio * duration;
  const per = thumbs ? thumbs.grid * thumbs.grid : 1;
  const n = thumbs ? Math.min(thumbs.count - 1, Math.floor(at / thumbs.every)) : 0;
  const sheet = Math.floor(n / per) + 1;
  const cell = n % per;
  return (
    <div className="pointer-events-none absolute bottom-7 -translate-x-1/2" style={{ left: `clamp(${thumbs ? thumbs.w / 2 : 30}px, ${ratio * 100}%, calc(100% - ${thumbs ? thumbs.w / 2 : 30}px))` }}>
      {thumbs && (
        <div
          className="border border-bone/20 bg-black shadow-2xl"
          style={{
            width: thumbs.w,
            height: thumbs.h,
            backgroundImage: `url(/api/stream/${grantId}/thumbs/${String(sheet).padStart(3, "0")}.jpg)`,
            backgroundPosition: `-${(cell % thumbs.grid) * thumbs.w}px -${Math.floor(cell / thumbs.grid) * thumbs.h}px`,
          }}
        />
      )}
      <p className="mt-1 text-center font-mono text-xs tabular-nums">{fmt(at)}</p>
    </div>
  );
}
