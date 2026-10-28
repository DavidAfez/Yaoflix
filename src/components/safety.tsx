"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import { report } from "@/app/safety/actions";
import { REASONS } from "@/lib/safety";
import { useT } from "./i18n";
import { Dots } from "./ui";

export { blockUser } from "@/app/safety/actions";

const LABELS: Record<(typeof REASONS)[number], string> = {
  spam: "Spam",
  harassment: "Harcèlement",
  hate: "Haine",
  spoiler: "Spoiler non signalé",
  offtopic: "Hors sujet (pas sur un film)",
  illegal: "Contenu illégal",
  other: "Autre",
};

/** Report a post, a member or a message. For a message, its text goes with the report (the server cannot read it). */
export function ReportSheet({ target, onClose }: { target: { type: "post" | "user" | "message"; id: string; label: string; text?: string }; onClose: () => void }) {
  const t = useT();
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!reason) return;
    setState("sending");
    const r = await report({ type: target.type, id: target.id, reason, note, text: target.text });
    if (!r.ok) {
      setState("idle");
      return setError(t(r.error ?? "Oups"));
    }
    setState("sent");
    setTimeout(onClose, 1100);
  };
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[90] bg-ink/70 backdrop-blur-sm" />
      <motion.div
        role="dialog"
        aria-label={t("Signaler")}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[95] border-t-2 border-coral bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 md:left-auto md:top-0 md:w-[420px] md:border-l-2 md:border-t-0 md:px-8 md:pt-10"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-coral">{t("Signaler")}</p>
            <p className="mt-1 truncate font-display text-xl font-semibold">{target.label}</p>
          </div>
          <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
            <X />
          </button>
        </div>
        {state === "sent" ? (
          <div className="grid place-items-center py-12">
            <span className="grid size-16 place-items-center rounded-full bg-coral text-ink">
              <Check size={28} strokeWidth={3} />
            </span>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)} className={`border px-3 py-2 text-sm transition-colors ${reason === r ? "border-coral bg-coral text-ink" : "border-line hover:border-bone/40"}`}>
                  {t(LABELS[r])}
                </button>
              ))}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder={t("Précisions (facultatif)")} className="w-full resize-none border border-line bg-transparent p-3 text-sm outline-none focus:border-coral" />
            {target.type === "message" && <p className="text-xs text-dim">{t("Le texte de ce message sera joint au signalement.")}</p>}
            {error && <p className="text-sm text-coral">{error}</p>}
            <button onClick={send} disabled={!reason || state === "sending"} className="flex h-11 w-full items-center justify-center bg-coral font-semibold text-ink disabled:opacity-40">
              {state === "sending" ? <Dots /> : t("Envoyer")}
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
}
