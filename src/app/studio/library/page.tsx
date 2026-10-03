import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { img } from "@/lib/tmdb";
import { toPoster } from "@/lib/view";
import { Library } from "./library";

export default async function Page(props: PageProps<"/studio/library">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const preId = Number(sp.title);
  const [pre] = Number.isFinite(preId) && preId > 0 ? await db.select().from(schema.titles).where(eq(schema.titles.id, preId)) : [];

  const media = await db
    .select({ m: schema.media, t: schema.titles, by: schema.users.handle })
    .from(schema.media)
    .innerJoin(schema.titles, eq(schema.titles.id, schema.media.titleId))
    .leftJoin(schema.users, eq(schema.users.id, schema.media.uploadedBy))
    .orderBy(desc(schema.media.createdAt))
    .limit(100);

  return (
    <Library
      canDelete={can.manageUsers(user.role)}
      preselect={pre ? { id: pre.id, ...toPoster(pre) } : null}
      media={media.map(({ m, t, by }) => ({
        id: m.id,
        status: m.status,
        progress: m.status === "UPLOADING" && m.sourceSize ? Math.floor((m.uploadedBytes / m.sourceSize) * 100) : m.progress,
        error: m.error,
        name: t.name,
        year: t.year,
        poster: img(t.posterPath, "w342"),
        heights: m.renditions.map((r) => r.height),
        audio: m.audioTracks.map((a) => a.label),
        subs: m.subtitles.map((s) => s.label),
        duration: m.durationSec,
        by,
        at: m.createdAt.toISOString(),
      }))}
    />
  );
}
