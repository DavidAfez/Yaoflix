import { requireRole } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { StudioNav } from "./nav";

export const metadata = { title: "Studio" };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(can.isStaff);
  const links = [
    { href: "/studio", label: "File" },
    { href: "/studio/library", label: "Upload" },
    ...(can.viewInsights(user.role) ? [{ href: "/studio/insights", label: "Insights" }] : []),
    ...(can.manageUsers(user.role) ? [{ href: "/studio/members", label: "Membres" }] : []),
    { href: "/studio/errors", label: "Erreurs" },
  ];
  return (
    <div>
      <StudioNav links={links} />
      <div className="px-4 py-8 md:px-10">{children}</div>
    </div>
  );
}
