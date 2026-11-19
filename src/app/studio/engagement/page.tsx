import { requireRole } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getEngagement } from "@/lib/engagement-stats";
import { getT } from "@/lib/i18n/server";
import { EngagementBoard } from "./board";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Engagement") };
}

export default async function Page(props: PageProps<"/studio/engagement">) {
  await requireRole(can.viewInsights);
  const sp = await props.searchParams;
  const days = [7, 30, 90].includes(Number(sp.d)) ? Number(sp.d) : 30;
  const data = await getEngagement(days);
  return <EngagementBoard data={JSON.parse(JSON.stringify(data))} days={days} />;
}
