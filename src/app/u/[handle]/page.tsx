import { notFound, redirect } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { readyTitleIds } from "@/lib/recos";
import { userReviews } from "@/lib/reviews";
import { hoursSeen } from "@/lib/marks";
import { toPoster } from "@/lib/view";
import { localizer } from "@/lib/tmdb";
import { Poster, Row } from "@/components/poster";
import { ReviewList } from "@/components/reviews";
import { profileFeed } from "@/lib/feed";
import { profileHead, topLists } from "@/lib/profile";
import { ProfileHeader, Top5Shelf } from "@/components/profile";
import { UserTabs } from "@/components/user-tabs";
import { Stat } from "@/app/me/stat";
import { getLocale, getT } from "@/lib/i18n/server";

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

  const [reviews, liked, seen, [counts], lists, head, hours, tops] = await Promise.all([
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
    profileFeed(me.id, member.id),
    profileHead(me.id, member.id),
    hoursSeen(member.id),
    topLists(member.id),
  ]);
  const ready = await readyTitleIds([...liked, ...seen].map((r) => r.title.id));
  const L = await localizer([...liked, ...seen].map((r) => r.title));
  const split = (rows: typeof liked) => ({
    movie: rows.filter((r) => r.title.kind === "movie"),
    tv: rows.filter((r) => r.title.kind === "tv"),
  });
  const l = split(liked);
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const s = split(seen);

  return (
    <main className="pb-24">
      <div className="px-4 md:px-10">
        <ProfileHeader head={head!} mine={false} />
        <dl className="mt-8 grid grid-cols-2 gap-px bg-line md:grid-cols-4">
          <Stat label="Vus" value={counts.seen} />
          <Stat label="Heures" value={hours} decimals={0} unit="h" />
          <Stat label="Aimés" value={counts.liked} />
          <Stat label="Avis" value={counts.reviews} />
        </dl>
        <Top5Shelf tops={tops} mine={false} />
      </div>

      <UserTabs
        lists={lists}
        reviews={
          reviews.length ? (
            <section className="mx-4 mt-6 md:mx-10">
              <ReviewList items={reviews} showTitle t={t} locale={locale} />
            </section>
          ) : (
            <p className="px-4 py-16 font-display text-3xl font-extrabold text-bone/15 md:px-10 md:text-5xl">{t("Rien ici pour l'instant.")}</p>
          )
        }
        library={
          <>
            {l.movie.length > 0 && <Row title="Films aimés">{l.movie.map((r, i) => <Poster key={r.title.id} t={toPoster(L(r.title), ready.has(r.title.id))} i={i} />)}</Row>}
            {l.tv.length > 0 && <Row title="Séries aimées">{l.tv.map((r, i) => <Poster key={r.title.id} t={toPoster(L(r.title), ready.has(r.title.id))} i={i} />)}</Row>}
            {s.movie.length > 0 && <Row title="Films vus">{s.movie.map((r, i) => <Poster key={r.title.id} t={toPoster(L(r.title), ready.has(r.title.id))} i={i} />)}</Row>}
            {s.tv.length > 0 && <Row title="Séries vues">{s.tv.map((r, i) => <Poster key={r.title.id} t={toPoster(L(r.title), ready.has(r.title.id))} i={i} />)}</Row>}
          </>
        }
      />
    </main>
  );
}
