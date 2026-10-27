import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getUser } from "@/lib/auth";
import { logout } from "../(auth)/actions";
import { AuthShell } from "../(auth)/shell";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("En attente") };
}

/** Email confirmed, waiting for staff to let the member in. */
export default async function Page() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.approved) redirect("/");
  const t = await getT();
  return (
    <AuthShell word={t("Patience.")}>
      <div className="space-y-8">
        <p className="font-display text-3xl font-extrabold leading-tight">@{user.handle}</p>
        <p className="text-lg text-bone/80">{t("Compte en cours de validation. Un mail arrive dès que c'est bon.")}</p>
        <form action={logout}>
          <button className="flex h-11 items-center gap-2 border border-line px-4 text-sm transition-colors hover:border-coral hover:text-coral">
            <LogOut size={15} /> {t("Déconnexion")}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
