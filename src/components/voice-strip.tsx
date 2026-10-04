"use client";
import { motion } from "motion/react";
import { Mic } from "lucide-react";

const BARS = 40;
// Deterministic heights so server and client render the same waveform
const heights = Array.from({ length: BARS }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)));

function Wave({ className = "" }: { className?: string }) {
  return (
    <div className={`flex h-16 items-center gap-[3px] ${className}`} aria-hidden>
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] bg-lime"
          initial={{ height: "8%" }}
          animate={{ height: [`${h * 30}%`, `${h * 100}%`, `${h * 45}%`] }}
          transition={{ duration: 1.4, repeat: Infinity, repeatType: "mirror", delay: i * 0.035, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/** Voice reviews, transcribed. Shown on the home and the landing. */
export function VoiceStrip({ big = false }: { big?: boolean }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`relative mt-14 overflow-hidden border-y border-line ${big ? "py-20" : "py-8"}`}
    >
      <div className="flex flex-col gap-6 px-4 md:flex-row md:items-center md:gap-10 md:px-10">
        <span className={`grid shrink-0 place-items-center rounded-full bg-lime text-ink ${big ? "size-24" : "size-14"}`}>
          <Mic size={big ? 40 : 24} />
        </span>
        <div className="shrink-0">
          <p className={`font-display font-extrabold leading-none tracking-tight ${big ? "text-5xl md:text-7xl" : "text-2xl md:text-4xl"}`}>
            Ton avis, en vocal.
          </p>
          <p className={`mt-2 font-mono uppercase tracking-widest text-lime ${big ? "text-sm" : "text-xs"}`}>Transcrit</p>
        </div>
        <Wave className="min-w-0 flex-1 overflow-hidden" />
      </div>
    </motion.section>
  );
}
