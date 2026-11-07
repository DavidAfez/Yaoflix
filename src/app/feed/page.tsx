import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { byTag, following, forYou, trendingTags } from "@/lib/feed";
import { normTag, TAG_CHARS } from "@/lib/hashtags";
import { ArrowLeft, Hash } from "lucide-react";
import { Composer, PostCard } from "@/components/feed";
import { getT } from "@/lib/i18n/server";
import { can } from "@/lib/rbac";

export async function generateMetadata(props: PageProps<"/feed">) {
  const tag = (await props.searchParams).tag;
  const t = await getT();
  return { title: typeof tag === "string" && tag ? `#${normTag(tag)}` : t("Feed") };
}

export default async function Page(props: PageProps<"/feed">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const tab = sp.tab === "suivis" ? "suivis" : "pour-toi";
  const t = await getT();
  // A hashtag opens its own feed: every post carrying it, newest first
  const tag = typeof sp.tag === "string" && TAG_CHARS.test(normTag(sp.tag)) ? normTag(sp.tag) : null;
  const [posts, trends] = await Promise.all([tag ? byTag(user.id, tag) : tab === "suivis" ? following(user.id) : forYou(user.id), tag ? Promise.resolve([]) : trendingTags()]);
  if (tag)
    return (
      <main className="mx-auto max-w-2xl md:border-x md:border-line">
        <header className="sticky top-11 z-20 flex items-center gap-3 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur-xl md:top-12">
          <Link href="/feed" aria-label={t("Retour")} className="grid size-9 place-items-center text-dim hover:text-bone">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="flex items-center gap-1 font-display text-xl font-extrabold">
            <Hash size={18} className="text-lime" />
            {tag}
          </h1>
          <span className="ml-auto font-mono text-xs text-dim">{t(posts.length === 1 ? "{n} post" : "{n} posts", { n: posts.length })}</span>
        </header>
        {posts.length ? (
          posts.map((p, i) => <PostCard key={`${p.id}${p.repostedBy ?? ""}`} p={p} i={i} />)
        ) : (
          <p className="px-6 py-20 font-display text-4xl font-extrabold leading-none text-bone/15 md:text-5xl">{t("Personne n'a encore utilisé ce hashtag.")}</p>
        )}
        <div className="h-16" />
      </main>
    );
  const tabs = [
    { key: "pour-toi", label: t("Pour toi"), href: "/feed" },
    { key: "suivis", label: t("Abonnements"), href: "/feed?tab=suivis" },
  ];

  return (
    <main className="mx-auto max-w-2xl md:border-x md:border-line">
      <h1 className="sr-only">{t("Feed")}</h1>
      <nav aria-label={t("Fils")} className="sticky top-11 z-20 grid grid-cols-2 border-b border-line bg-ink/90 backdrop-blur-xl md:top-12">
        {tabs.map((x) => (
          <Link key={x.key} href={x.href} className={`relative py-4 text-center text-sm ${tab === x.key ? "text-bone" : "text-dim hover:text-bone"}`}>
            {x.label}
            {tab === x.key && <span className="absolute inset-x-1/3 -bottom-px h-0.5 bg-lime" />}
          </Link>
        ))}
      </nav>
      {trends.length > 0 && (
        <div className="scrollbar-none flex items-center gap-2 overflow-x-auto border-b border-line px-4 py-3 md:px-6" aria-label={t("Hashtags du moment")}>
          <Hash size={14} className="shrink-0 text-lime" aria-hidden />
          {trends.map((x) => (
            <Link key={x.tag} href={`/feed?tag=${encodeURIComponent(x.tag)}`} className="shrink-0 border border-line px-2.5 py-1 text-sm text-bone/80 transition-colors hover:border-lime hover:text-lime">
              #{x.tag}
              <span className="ml-1.5 font-mono text-[10px] text-dim">{x.n}</span>
            </Link>
          ))}
        </div>
      )}
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
