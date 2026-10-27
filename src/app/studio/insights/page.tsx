import { requireRole } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getInsights } from "@/lib/insights";
import { Dashboard } from "./dashboard";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Insights") };
}

export default async function Page(props: PageProps<"/studio/insights">) {
  await requireRole(can.viewInsights);
  const sp = await props.searchParams;
  const days = [7, 30, 90, 365].includes(Number(sp.d)) ? Number(sp.d) : 30;
  const data = await getInsights(days);
  return <Dashboard data={JSON.parse(JSON.stringify(data))} days={days} />;
}
