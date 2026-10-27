"use client";
import Link from "next/link";
import { useActionState } from "react";
import { login } from "../actions";
import { Field, Submit, FormError } from "@/components/ui";
import { useT } from "@/components/i18n";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(login, undefined);
  const t = useT();
  return (
    <form action={action} className="space-y-7">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
      <FormError message={state?.error} />
      <div className="flex items-center justify-between gap-4 pt-2">
        <Submit size="lg">{t("Entrer")}</Submit>
        <div className="flex flex-col items-end gap-1 text-sm text-dim">
          <Link href="/join" className="hover:text-bone">{t("Créer un compte")}</Link>
          <Link href="/forgot" className="hover:text-bone">{t("Oublié ?")}</Link>
        </div>
      </div>
    </form>
  );
}
