"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, MonitorSmartphone, Trash2, X } from "lucide-react";
import { type Device, type Me } from "@/lib/e2e";
import { useLocale, useT } from "../i18n";
import { Dots } from "../ui";

/** A new device of this member, shown on the trusted ones with the code to compare. */
export function Approval({ device, onApprove, onRefuse }: { device: Device & { code: string }; onApprove: (progress: (n: number) => void) => Promise<void>; onRefuse: () => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState<number | null>(null);
  return (
    <div className="border-b border-line bg-lime/10 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <MonitorSmartphone size={15} className="text-lime" /> {t("Nouvel appareil : {label}", { label: device.label || "?" })}
      </p>
      <p className="mt-1 text-bone/80">{t("Autorise-le seulement si ce code est affiché dessus :")}</p>
      <p className="mt-2 font-mono text-2xl tracking-widest text-lime">{device.code}</p>
      {busy !== null ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-dim">
          <Dots /> {t("Envoi de l'historique chiffré… {n}", { n: busy })}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              setBusy(0);
              void onApprove(setBusy).finally(() => setBusy(null));
            }}
            aria-label={t("Autoriser")}
            title={t("Autoriser")}
            className="grid size-10 place-items-center bg-lime text-ink"
          >
            <Check size={18} />
          </button>
          <button onClick={() => void onRefuse()} aria-label={t("Refuser")} title={t("Refuser")} className="grid size-10 place-items-center border border-line hover:border-coral hover:text-coral">
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

/** A device that isn't trusted yet: it waits for another of the member's devices to let it in. */
export function PendingGate({ code, onReset }: { code: string; onReset: () => Promise<void> }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <span className="mb-6 grid size-14 place-items-center bg-lime text-ink">
        <MonitorSmartphone size={24} />
      </span>
      <h1 className="font-display text-3xl font-extrabold">{t("Nouvel appareil")}</h1>
      <p className="mt-3 text-bone/80">{t("Ouvre Messages sur un appareil où tu es déjà connecté et autorise celui-ci. Vérifie que le code est le même :")}</p>
      <p className="mt-6 font-mono text-4xl tracking-widest text-lime">{code}</p>
      <p className="mt-6 flex items-center gap-2 text-xs text-dim">
        <Dots /> {t("En attente")}
      </p>
      {!confirm ? (
        <button onClick={() => setConfirm(true)} className="mt-10 text-sm text-dim hover:text-coral">
          {t("Je n'ai plus accès à mes autres appareils")}
        </button>
      ) : (
        <div className="mt-10 border-l-2 border-coral bg-ink-2 p-4 text-sm">
          <p>{t("Cet appareil devient ta clé principale. Tes autres appareils sont déconnectés et tes anciens messages ne seront pas lisibles ici.")}</p>
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onReset().finally(() => setBusy(false));
              }}
              className="notch h-10 bg-coral px-5 font-semibold text-ink disabled:opacity-40"
            >
              {busy ? <Dots /> : t("Continuer")}
            </button>
            <button onClick={() => setConfirm(false)} aria-label={t("Annuler")} className="grid size-10 place-items-center border border-line">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DevicesSheet({ me, mine, onRevoke, onClose }: { me: Me; mine: Device[]; onRevoke: (d: Device) => Promise<void>; onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[90] bg-ink/70 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[95] max-h-[80dvh] overflow-y-auto border-t-2 border-lime bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 md:left-auto md:top-0 md:max-h-none md:w-[400px] md:border-l-2 md:border-t-0 md:pt-10"
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="font-display text-xl font-semibold">{t("Mes appareils")}</p>
          <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
            <X />
          </button>
        </div>
        <p className="mb-5 text-sm text-dim">{t("Chaque appareil a sa propre clé, qui ne le quitte jamais.")}</p>
        <ul className="space-y-1">
          {mine.map((d) => (
            <li key={d.id} className="flex items-center gap-3 border-b border-line py-3">
              <MonitorSmartphone size={16} className={d.id === me.id ? "text-lime" : "text-dim"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{d.label || "?"}</span>
                <span className="font-mono text-[10px] text-dim">
                  {d.id === me.id ? t("Cet appareil") : new Date(d.createdAt).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR")}
                </span>
              </span>
              {d.id !== me.id && (
                <button onClick={() => void onRevoke(d)} aria-label={t("Retirer")} title={t("Retirer")} className="grid size-9 place-items-center text-dim hover:text-coral">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </motion.div>
    </>
  );
}
