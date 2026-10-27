"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { FormError, Submit } from "@/components/ui";
import { reportBug } from "./actions";
import { useT } from "@/components/i18n";

export function BugForm({ from }: { from: string }) {
  const [state, action] = useActionState(reportBug, undefined);
  const [ua, setUa] = useState("");
  const t = useT();
  useEffect(() => setUa(navigator.userAgent), []);
  if (state?.ok)
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <span className="grid size-20 place-items-center rounded-full bg-lime text-ink">
          <Check size={36} strokeWidth={3} />
        </span>
        <p className="font-display text-3xl font-extrabold">{t("Bien reçu, merci.")}</p>
        <Link href={from || "/"} className="notch inline-flex h-11 items-center bg-lime px-5 text-sm font-semibold text-ink">
          {t("Retour")}
        </Link>
      </motion.div>
    );
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="ua" value={ua} />
      <textarea
        name="text"
        required
        minLength={5}
        maxLength={4000}
        rows={7}
        autoFocus
        placeholder={t("Ce qui s'est passé, ce que tu faisais")}
        className="w-full resize-none border border-line bg-ink-2 p-4 text-base outline-none placeholder:text-bone/30 focus:border-lime"
      />
      {from && <p className="font-mono text-xs text-dim">{t("Page")} : {from}</p>}
      <FormError message={state?.error} />
      <Submit>{t("Envoyer")}</Submit>
    </form>
  );
}
