import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthShell } from "../shell";
import { JoinForm } from "./form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Rejoindre") };
}

export default async function Page() {
  if (await getUser()) redirect("/");
  return (
    <AuthShell word="Entre.">
      <JoinForm />
    </AuthShell>
  );
}
