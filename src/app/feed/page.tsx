import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { following, forYou } from "@/lib/feed";
import { Composer, PostCard } from "@/components/feed";

export const metadata = { title: "Feed" };

export default async function Page(props: PageProps<"/feed">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const tab = sp.tab === "suivis" ? "suivis" : "pour-toi";
  const posts = tab === "suivis" ? await following(user.id) : await forYou(user.id);
  const tabs = [
    { key: "pour-toi", label: "Pour toi", href: "/feed" },
    { key: "suivis", label: "Abonnements", href: "/feed?tab=suivis" },
  ];

  return (
    <main className="mx-auto max-w-2xl md:border-x md:border-line">
      <nav className="sticky top-0 z-20 grid grid-cols-2 border-b border-line bg-ink/90 backdrop-blur-xl md:top-12">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className={`relative py-4 text-center text-sm ${tab === t.key ? "text-bone" : "text-dim hover:text-bone"}`}>
            {t.label}
            {tab === t.key && <span className="absolute inset-x-1/3 -bottom-px h-0.5 bg-lime" />}
          </Link>
        ))}
      </nav>
      <Composer />
      {posts.length ? (
        posts.map((p, i) => <PostCard key={`${p.id}${p.repostedBy ?? ""}`} p={p} i={i} />)
      ) : (
        <p className="px-6 py-20 font-display text-4xl font-extrabold leading-none text-bone/15 md:text-5xl">
          {tab === "suivis" ? "Suis des cinéphiles." : "Lance la discussion."}
        </p>
      )}
      <div className="h-16" />
    </main>
  );
}
