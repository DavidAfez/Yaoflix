"use client";
import { motion } from "motion/react";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[80dvh] flex-col items-center justify-center gap-10 p-6 text-center">
      <motion.p initial={{ rotate: -4, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} className="font-display text-7xl font-extrabold tracking-tighter md:text-9xl">
        Oups<span className="text-coral">.</span>
      </motion.p>
      <button onClick={reset} className="notch bg-lime px-8 py-4 font-semibold text-ink">
        Réessayer
      </button>
    </main>
  );
}
