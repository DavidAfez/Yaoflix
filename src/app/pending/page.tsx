import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getUser } from "@/lib/auth";
import { logout } from "../(auth)/actions";
import { AuthShell } from "../(auth)/shell";

export const metadata = { title: "En attente" };

/** Email confirmed, waiting for staff to let the member in. */
export default async function Page() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.approved) redirect("/");
  return (
    <AuthShell word="Patience.">
      <div className="space-y-8">
        <p className="font-display text-3xl font-extrabold leading-tight">@{user.handle}</p>
        <p className="text-lg text-bone/80">Compte en cours de validation. Un mail arrive dès que c'est bon.</p>
        <form action={logout}>
          <button className="flex h-11 items-center gap-2 border border-line px-4 text-sm transition-colors hover:border-coral hover:text-coral">
            <LogOut size={15} /> Déconnexion
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
