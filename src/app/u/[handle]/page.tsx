import { notFound, redirect } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { readyTitleIds } from "@/lib/recos";
import { userReviews } from "@/lib/reviews";
import { toPoster } from "@/lib/view";
import { Poster, Row } from "@/components/poster";
import { ReviewList } from "@/components/reviews";
import { followState, postsBy } from "@/lib/feed";
import { FollowButton, PostCard } from "@/components/feed";
import { Stat } from "@/app/me/stat";

export async function generateMetadata(props: PageProps<"/u/[handle]">) {
  const { handle } = await props.params;
  return { title: `@${decodeURIComponent(handle).replace(/^@/, "")}` };
}

/** A member as other members see it: pseudonym, tastes and reviews. No age, sex, country or contact. */
export default async function Page(props: PageProps<"/u/[handle]">) {
  const me = await requireUser();
  const handle = decodeURIComponent((await props.params).handle).replace(/^@/, "").toLowerCase();
  if (handle === me.handle) redirect("/me");
  const [member] = await db
    .select({ id: schema.users.id, handle: schema.users.handle })
    .from(schema.users)
    .where(and(eq(schema.users.handle, handle), isNull(schema.users.bannedAt)));
  if (!member) notFound();

  const [reviews, liked, seen, [counts], posts, fol] = await Promise.all([
    userReviews(member.id),
    db
      .select({ title: schema.titles })
      .from(schema.likes)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.likes.titleId))
      .where(and(eq(schema.likes.userId, member.id), eq(schema.likes.value, 1)))
      .orderBy(desc(schema.likes.createdAt))
      .limit(40),
    db
      .select({ title: schema.titles })
      .from(schema.seen)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.seen.titleId))
      .where(eq(schema.seen.userId, member.id))
      .orderBy(desc(schema.seen.createdAt))
      .limit(40),
    db.execute<{ seen: number; liked: number; reviews: number }>(sql`
      select
        (select count(*)::int from seen where user_id = ${member.id}) as seen,
        (select count(*)::int from likes where user_id = ${member.id} and value = 1) as liked,
        (select count(*)::int from feedback where user_id = ${member.id}) as reviews
    `).then((r) => r.rows),
    postsBy(me.id, member.id),
    followState(me.id, member.id),
  ]);
  const ready = await readyTitleIds([...liked, ...seen].map((r) => r.title.id));
  const split = (rows: typeof liked) => ({
    movie: rows.filter((r) => r.title.kind === "movie"),
    tv: rows.filter((r) => r.title.kind === "tv"),
  });
  const l = split(liked);
  const s = split(seen);

  return (
    <main className="py-8 md:py-10">
      <header className="mx-4 border-b border-line pb-8 md:mx-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="break-all font-display text-5xl font-extrabold tracking-tighter md:text-8xl">@{member.handle}</h1>
          <FollowButton handle={member.handle} following={fol.following} />
        </div>
        <dl className="mt-8 grid grid-cols-3 gap-px bg-line md:grid-cols-5">
          <Stat label="Vus" value={counts.seen} />
          <Stat label="Aimés" value={counts.liked} />
          <Stat label="Avis" value={counts.reviews} />
          <Stat label="Abonnés" value={fol.followers} />
          <Stat label="Abonnements" value={fol.follows} />
        </dl>
      </header>

      {l.movie.length > 0 && <Row title="Films aimés">{l.movie.map((r, i) => <Poster key={r.title.id} t={toPoster(r.title, ready.has(r.title.id))} i={i} />)}</Row>}
      {l.tv.length > 0 && <Row title="Séries aimées">{l.tv.map((r, i) => <Poster key={r.title.id} t={toPoster(r.title, ready.has(r.title.id))} i={i} />)}</Row>}

      {posts.length > 0 && (
        <section className="mx-4 mt-12 max-w-2xl border-t border-line md:mx-10">
          <h2 className="mb-2 mt-8 flex items-baseline gap-3 font-display text-xl font-semibold tracking-tight md:text-2xl">
            Posts <span className="font-mono text-xs text-lime">{String(posts.length).padStart(2, "0")}</span>
          </h2>
          {posts.map((p, i) => (
            <PostCard key={p.id} p={p} i={i} />
          ))}
        </section>
      )}

      {reviews.length > 0 && (
        <section className="mx-4 mt-12 md:mx-10">
          <h2 className="mb-6 flex items-baseline gap-3 font-display text-xl font-semibold tracking-tight md:text-2xl">
            Avis <span className="font-mono text-xs text-lime">{String(reviews.length).padStart(2, "0")}</span>
          </h2>
          <ReviewList items={reviews} showTitle />
        </section>
      )}

      {s.movie.length > 0 && <Row title="Films vus">{s.movie.map((r, i) => <Poster key={r.title.id} t={toPoster(r.title, ready.has(r.title.id))} i={i} />)}</Row>}
      {s.tv.length > 0 && <Row title="Séries vues">{s.tv.map((r, i) => <Poster key={r.title.id} t={toPoster(r.title, ready.has(r.title.id))} i={i} />)}</Row>}
      <div className="h-16" />
    </main>
  );
}
