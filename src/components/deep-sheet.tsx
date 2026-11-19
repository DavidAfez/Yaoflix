"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { getDeepReview, saveDeepReview } from "@/app/t/actions";
import { CRITERIA, TAGS } from "@/lib/deep";
import { useT } from "./i18n";
import { Dots } from "./ui";
import type { Target } from "./marks";

/** Detailed review: tap a score per criterion and a few tags. Nothing to type. */
export function DeepSheet({ target, onClose, onDone }: { target: Target | null; onClose: () => void; onDone: (t: Target) => void }) {
  const router = useRouter();
  const tr = useT();
  const [mounted, setMounted] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [phase, setPhase] = useState<"load" | "idle" | "sending" | "sent">("load");

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!target) return;
    let stale = false;
    setPhase("load");
    setScores({});
    setTags([]);
    void getDeepReview(target.kind, target.tmdbId).then((r) => {
      if (stale) return;
      if (r) {
        setScores(r.scores);
        setTags(r.tags);
      }
      setPhase("idle");
    });
    return () => {
      stale = true;
    };
  }, [target]);

  const filled = Object.keys(scores).length;
  const save = async () => {
    if (!target || !filled) return;
    setPhase("sending");
    const res = await saveDeepReview(target.kind, target.tmdbId, { scores, tags });
    if (!res.ok) return setPhase("idle");
    setPhase("sent");
    onDone(target);
    router.refresh();
    setTimeout(onClose, 1000);
  };

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {target && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[90] bg-ink/70 backdrop-blur-sm" />
          <motion.div
            role="dialog"
            aria-label={tr("Analyse")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-[95] max-h-[92dvh] overflow-y-auto border-t-2 border-lime bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 md:left-auto md:top-0 md:max-h-none md:w-[520px] md:border-l-2 md:border-t-0 md:px-8 md:pt-10"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-lime">{tr("Analyse")}</p>
                <p className="mt-1 font-display text-2xl font-semibold leading-tight">{target.name}</p>
              </div>
              <button onClick={onClose} aria-label={tr("Fermer")} className="text-dim hover:text-bone">
                <X />
              </button>
            </div>

            {phase === "sent" ? (
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid place-items-center py-14">
                <span className="grid size-20 place-items-center rounded-full bg-lime text-ink">
                  <Check size={36} strokeWidth={3} />
                </span>
              </motion.div>
            ) : phase === "load" ? (
              <div className="grid place-items-center py-14">
                <Dots />
              </div>
            ) : (
              <div className="space-y-7">
                <ul className="space-y-3">
                  {CRITERIA.map((c) => (
                    <li key={c.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <span className="text-sm">{tr(c.label)}</span>
                      <Segments
                        value={scores[c.key] ?? 0}
                        onChange={(n) =>
                          setScores((s) => {
                            const next = { ...s };
                            if (next[c.key] === n) delete next[c.key];
                            else next[c.key] = n;
                            return next;
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {TAGS.map((t) => {
                    const on = tags.includes(t);
                    return (
                      <motion.button
                        key={t}
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setTags((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}
                        className={`border px-3 py-1.5 text-sm transition-colors ${on ? "border-lime bg-lime text-ink" : "border-line text-bone/80 hover:border-bone/40"}`}
                      >
                        {tr(t)}
                      </motion.button>
                    );
                  })}
                </div>
                <button onClick={save} disabled={!filled || phase === "sending"} className="notch flex h-12 w-full items-center justify-center bg-lime font-semibold text-ink disabled:opacity-40">
                  {phase === "sending" ? <Dots /> : tr("Enregistrer")}
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

/** Five tappable blocks, from 1 to 5. Tapping the current value clears it. */
function Segments({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useT();
  return (
    <div className="flex gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t("{n} sur 5", { n })}
          whileTap={{ scale: 0.85 }}
          onClick={() => onChange(n)}
          className={`h-8 w-7 transition-colors md:w-8 ${n <= value ? "bg-lime" : "bg-bone/10 hover:bg-bone/20"}`}
        />
      ))}
    </div>
  );
}
