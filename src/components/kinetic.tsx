"use client";
import { motion } from "motion/react";

/** Big display word, letters drop in one by one. */
export function Kinetic({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={`inline-flex overflow-hidden ${className}`} aria-label={text}>
      {text.split("").map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          initial={{ y: "110%", rotate: 8 }}
          animate={{ y: "0%", rotate: 0 }}
          transition={{ delay: delay + i * 0.035, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block whitespace-pre"
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

export function Glow({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div className="absolute -left-1/4 top-0 size-[70vmax] animate-drift bg-[radial-gradient(closest-side,rgb(200_255_46/0.16),transparent)]" />
      <div className="absolute -bottom-1/3 right-[-20%] size-[60vmax] animate-drift bg-[radial-gradient(closest-side,rgb(143_227_255/0.12),transparent)] [animation-delay:-9s]" />
    </div>
  );
}
