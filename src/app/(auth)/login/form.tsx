"use client";
import Link from "next/link";
import { useActionState } from "react";
import { login } from "../actions";
import { Field, Submit, FormError } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-7">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
      <FormError message={state?.error} />
      <div className="flex items-center justify-between gap-4 pt-2">
        <Submit size="lg">Entrer</Submit>
        <div className="flex flex-col items-end gap-1 text-sm text-dim">
          <Link href="/join" className="hover:text-bone">Créer un compte</Link>
          <Link href="/forgot" className="hover:text-bone">Oublié ?</Link>
        </div>
      </div>
    </form>
  );
}
