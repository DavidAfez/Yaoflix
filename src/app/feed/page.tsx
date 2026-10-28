import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { following, forYou } from "@/lib/feed";
import { Composer, PostCard } from "@/components/feed";
import { getT } from "@/lib/i18n/server";
import { can } from "@/lib/rbac";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Feed") };
}

export default async function Page(props: PageProps<"/feed">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const tab = sp.tab === "suivis" ? "suivis" : "pour-toi";
  const t = await getT();
  const posts = tab === "suivis" ? await following(user.id) : await forYou(user.id);
  const tabs = [
    { key: "pour-toi", label: t("Pour toi"), href: "/feed" },
    { key: "suivis", label: t("Abonnements"), href: "/feed?tab=suivis" },
  ];

  return (
    <main className="mx-auto max-w-2xl md:border-x md:border-line">
      <nav className="sticky top-11 z-20 grid grid-cols-2 border-b border-line bg-ink/90 backdrop-blur-xl md:top-12">
        {tabs.map((x) => (
          <Link key={x.key} href={x.href} className={`relative py-4 text-center text-sm ${tab === x.key ? "text-bone" : "text-dim hover:text-bone"}`}>
            {x.label}
            {tab === x.key && <span className="absolute inset-x-1/3 -bottom-px h-0.5 bg-lime" />}
          </Link>
        ))}
      </nav>
      <Composer canCapture={can.capture(user.role)} />
      {posts.length ? (
        posts.map((p, i) => <PostCard key={`${p.id}${p.repostedBy ?? ""}`} p={p} i={i} />)
      ) : (
        <p className="px-6 py-20 font-display text-4xl font-extrabold leading-none text-bone/15 md:text-5xl">
          {t(tab === "suivis" ? "Suis des cinéphiles." : "Lance la discussion.")}
        </p>
      )}
      <div className="h-16" />
    </main>
  );
}
