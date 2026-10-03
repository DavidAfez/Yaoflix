import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { readyTitleIds } from "@/lib/recos";
import { toPoster } from "@/lib/view";
import { Poster } from "@/components/poster";
import { Kinetic } from "@/components/kinetic";

export const metadata = { title: "Liste" };

export default async function Page() {
  const user = await requireUser();
  const rows = await db
    .select({ title: schema.titles })
    .from(schema.watchlist)
    .innerJoin(schema.titles, eq(schema.titles.id, schema.watchlist.titleId))
    .where(eq(schema.watchlist.userId, user.id))
    .orderBy(desc(schema.watchlist.createdAt));
  const ready = await readyTitleIds(rows.map((r) => r.title.id));

  return (
    <main className="px-4 py-10 md:px-10">
      <h1 className="mb-10 font-display text-6xl font-extrabold tracking-tighter md:text-8xl">
        <Kinetic text="Liste" />
        <span className="ml-3 align-top font-mono text-base text-lime">{String(rows.length).padStart(2, "0")}</span>
      </h1>
      {rows.length === 0 ? (
        <p className="py-24 text-center font-display text-4xl text-bone/15">Vide.</p>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-6 md:gap-x-5 xl:grid-cols-8 [&>*]:w-auto">
          {rows.map(({ title }, i) => (
            <Poster key={title.id} t={toPoster(title, ready.has(title.id))} i={i} />
          ))}
        </div>
      )}
    </main>
  );
}
