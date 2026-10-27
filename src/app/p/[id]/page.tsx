import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { thread } from "@/lib/feed";
import { Composer, PostCard } from "@/components/feed";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Post") };
}

export default async function Page(props: PageProps<"/p/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await thread(user.id, id);
  if (!t) notFound();
  const tr = await getT();
  return (
    <main className="mx-auto max-w-2xl md:border-x md:border-line">
      <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-ink/90 px-4 backdrop-blur-xl md:top-12 md:px-6">
        <Link href="/feed" className="flex items-center gap-2 text-sm hover:text-lime">
          <ArrowLeft size={16} /> Feed
        </Link>
      </div>
      {t.parent && (
        <div className="opacity-70">
          <PostCard p={t.parent} />
        </div>
      )}
      <PostCard p={t.post} big />
      <Composer parentId={t.post.id} placeholder={tr("Répondre à @{h}", { h: t.post.handle })} />
      {t.replies.map((r, i) => (
        <PostCard key={r.id} p={r} i={i} />
      ))}
      <div className="h-16" />
    </main>
  );
}
