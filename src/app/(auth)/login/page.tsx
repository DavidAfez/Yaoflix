import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthShell } from "../shell";
import { LoginForm } from "./form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Connexion") };
}

export default async function Page(props: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <AuthShell word="Re.">
      <LoginForm next={next} />
    </AuthShell>
  );
}
