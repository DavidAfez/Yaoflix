import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthShell } from "../shell";
import { JoinForm } from "./form";

export const metadata = { title: "Rejoindre" };

export default async function Page() {
  if (await getUser()) redirect("/");
  return (
    <AuthShell word="Entre.">
      <JoinForm />
    </AuthShell>
  );
}
