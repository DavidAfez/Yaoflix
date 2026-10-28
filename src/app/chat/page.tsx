import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { ChatApp } from "@/components/chat/app";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Messages") };
}

export default async function Page(props: PageProps<"/chat">) {
  await requireUser();
  const sp = await props.searchParams;
  return <ChatApp to={typeof sp.to === "string" ? sp.to : null} />;
}
