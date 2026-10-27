"use client";
import { useActionState } from "react";
import { forgot } from "../actions";
import { Field, Submit } from "@/components/ui";
import { Sent } from "../sent";
import { Kinetic } from "@/components/kinetic";
import { useT } from "@/components/i18n";

export default function Page() {
  const [state, action] = useActionState(forgot, undefined);
  const t = useT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-12 p-6">
      <h1 className="font-display text-6xl font-extrabold tracking-tighter"><Kinetic text={t("Oublié.")} /></h1>
      {state?.sent ? (
        <Sent />
      ) : (
        <form action={action} className="space-y-8">
          <Field label="Email" name="email" type="email" required autoComplete="email" />
          <Submit size="lg">{t("Envoyer")}</Submit>
        </form>
      )}
    </main>
  );
}
