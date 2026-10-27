import { requireUser } from "@/lib/auth";
import { BugForm } from "./form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Un souci ?") };
}

export default async function Page(props: PageProps<"/bug">) {
  await requireUser();
  const t = await getT();
  const sp = await props.searchParams;
  const from = typeof sp.from === "string" && sp.from.startsWith("/") ? sp.from : "";
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <h1 className="mb-10 font-display text-5xl font-extrabold tracking-tighter md:text-7xl">{t("Un souci ?")}</h1>
      <BugForm from={from} />
    </main>
  );
}
