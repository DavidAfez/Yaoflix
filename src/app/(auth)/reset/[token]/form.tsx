"use client";
import { useActionState } from "react";
import { resetPassword } from "../../actions";
import { Field, Submit, FormError } from "@/components/ui";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="token" value={token} />
      <Field label="Mot de passe" name="password" type="password" required minLength={10} autoComplete="new-password" />
      <FormError message={state?.error} />
      <Submit size="lg">Valider</Submit>
    </form>
  );
}
