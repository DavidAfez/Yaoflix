"use client";
import { useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[80dvh] flex-col items-center justify-center gap-10 p-6 text-center">
      <motion.p initial={{ rotate: -4, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} className="font-display text-7xl font-extrabold tracking-tighter md:text-9xl">
        Oups<span className="text-coral">.</span>
      </motion.p>
      <div className="flex items-center gap-6">
        <button onClick={reset} className="notch bg-lime px-8 py-4 font-semibold text-ink">
          Réessayer
        </button>
        <Link href="/" className="text-sm text-dim hover:text-bone">
          Accueil
        </Link>
      </div>
      {/* Only shown while developing, to know what broke without opening the terminal */}
      {process.env.NODE_ENV !== "production" && (
        <pre className="max-w-2xl whitespace-pre-wrap border-l-2 border-coral bg-ink-2 p-4 text-left font-mono text-xs text-bone/80">
          {error.message}
          {error.digest ? `\n${error.digest}` : ""}
        </pre>
      )}
      {process.env.NODE_ENV === "production" && error.digest && <p className="font-mono text-xs text-dim">{error.digest}</p>}
    </main>
  );
}
