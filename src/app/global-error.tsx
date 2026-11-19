"use client";
import "./globals.css";

/** Last resort when the layout itself fails: no providers, so plain French and English. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-ink p-6 text-center text-bone">
        <p className="font-display text-7xl font-extrabold tracking-tighter">
          Oups<span className="text-coral">.</span>
        </p>
        <p className="text-sm text-dim">Le site a eu un raté. / Something broke.</p>
        <button onClick={reset} className="notch bg-lime px-8 py-4 font-semibold text-ink">
          Réessayer
        </button>
      </body>
    </html>
  );
}
