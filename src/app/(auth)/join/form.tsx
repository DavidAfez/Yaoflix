"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Info } from "lucide-react";
import { join } from "../actions";
import { Field, Submit, FormError, Choice } from "@/components/ui";
import { ageBrackets, sexes } from "@/lib/labels";
import { Sent } from "../sent";
import { useT } from "@/components/i18n";

export function JoinForm() {
  const [state, action] = useActionState(join, undefined);
  const t = useT();
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<string>("");
  const [creator, setCreator] = useState(false);
  const [info, setInfo] = useState(false);
  if (state?.sent) return <Sent />;
  return (
    <form action={action} className="space-y-7">
      <Field label="Pseudo" name="handle" autoComplete="username" required minLength={3} maxLength={20} />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" required minLength={10} />

      <fieldset>
        <legend className="mb-3 font-display text-xs uppercase tracking-[0.2em]">{t("Âge")}</legend>
        <input type="hidden" name="age" value={age} />
        <div className="grid grid-cols-3 gap-px bg-line">
          {ageBrackets.map((a) => (
            <motion.button
              key={a}
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => setAge(a)}
              className={`h-12 font-mono text-sm transition-colors ${age === a ? "bg-lime text-ink" : "bg-ink text-dim hover:text-bone"}`}
            >
              {a}
            </motion.button>
          ))}
        </div>
      </fieldset>

      <input type="hidden" name="sex" value={sex} />
      <Choice name="sex-ui" label="Genre" value={sex} onChange={setSex} options={[...sexes, { value: "", label: "Passer" }]} />

      <div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" name="creator" checked={creator} onChange={(e) => setCreator(e.target.checked)} className="peer sr-only" />
            <span className={`grid size-5 place-items-center border transition-colors ${creator ? "border-lime bg-lime text-ink" : "border-line"} peer-focus-visible:outline peer-focus-visible:outline-lime`}>
              {creator && <Check size={14} strokeWidth={3} />}
            </span>
            {t("Demander un profil créateur")}
          </label>
          <button type="button" onClick={() => setInfo(!info)} aria-label={t("C'est quoi ?")} aria-expanded={info} className={`grid size-6 place-items-center transition-colors ${info ? "text-lime" : "text-dim hover:text-bone"}`}>
            <Info size={15} />
          </button>
        </div>
        <AnimatePresence>
          {info && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden border-l-2 border-lime pl-3 text-sm text-bone/80"
            >
              {t("Pour les vidéastes : tu mets en ligne tes courts, films ou séries, avec affiche, synopsis et générique, et les membres les regardent comme le reste du catalogue. L'équipe valide la demande.")}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <FormError message={state?.error} />
      <div className="flex items-center justify-between gap-4 pt-2">
        <Submit size="lg">{t("Créer")}</Submit>
        <Link href="/login" className="text-sm text-dim underline-offset-4 hover:text-bone hover:underline">
          {t("J'ai un compte")}
        </Link>
      </div>
    </form>
  );
}
