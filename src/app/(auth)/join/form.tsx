"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { motion } from "motion/react";
import { join } from "../actions";
import { Field, Submit, FormError, Choice } from "@/components/ui";
import { ageBrackets, sexes } from "@/lib/labels";
import { Sent } from "../sent";

export function JoinForm() {
  const [state, action] = useActionState(join, undefined);
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<string>("");
  if (state?.sent) return <Sent />;
  return (
    <form action={action} className="space-y-7">
      <Field label="Pseudo" name="handle" autoComplete="username" required minLength={3} maxLength={20} />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" required minLength={10} />

      <fieldset>
        <legend className="mb-3 font-display text-xs uppercase tracking-[0.2em]">Âge</legend>
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

      <FormError message={state?.error} />
      <div className="flex items-center justify-between gap-4 pt-2">
        <Submit size="lg">Créer</Submit>
        <Link href="/login" className="text-sm text-dim underline-offset-4 hover:text-bone hover:underline">
          J&apos;ai un compte
        </Link>
      </div>
    </form>
  );
}
