/**
 * npm run db:posts            fills the feed with posts from demo members, to have something to scroll
 * npm run db:posts -- --clear removes every post of the demo members
 *
 * Demo members are handles starting with "demo_", they cannot log in (random password).
 */
import { inArray, like, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { db, schema } from "@/db";
import { blindIndex, encrypt } from "@/lib/crypto";
import type { TitleRef } from "@/db/schema";

const HANDLES = ["demo_cinephile", "demo_nollywood", "demo_kurosawa", "demo_popcorn", "demo_libreville", "demo_seriephile", "demo_noir", "demo_anime", "demo_docu", "demo_minuit"];
const REVIEWS = [
  "Revu hier soir, toujours aussi fort. La dernière demi-heure est une leçon.",
  "Franchement surcoté. Belle image mais le scénario tourne en rond.",
  "La bande-son me reste en tête depuis trois jours.",
  "Ce plan-séquence au milieu du film, j'ai arrêté de respirer.",
  "Pas ouf finalement, le rythme s'effondre au deuxième acte.",
  "Meilleur rôle de sa carrière, sans débat.",
  "Je l'ai lancé sans conviction, j'ai fini en larmes.",
  "La photo est sublime, chaque image pourrait être encadrée.",
  "Trop long de 40 minutes, mais la fin rattrape tout.",
  "À voir en VO absolument, le doublage tue les dialogues.",
  "Le twist, je l'avais vu venir dès la première scène.",
  "Parfait pour un dimanche pluvieux.",
  "Ce film a vieilli, mais il reste culte.",
  "Quelqu'un peut m'expliquer la fin ?",
  "Gros coup de cœur, je le recommande à tout le monde.",
];
const REPLIES = ["Totalement d'accord.", "Je ne suis pas du tout d'accord 😅", "La fin m'a laissé sans voix aussi.", "Il faut que je le revoie.", "Merci pour la reco !", "Tu as vu la suite ?"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

async function members() {
  const pw = await hash(randomBytes(16).toString("hex"));
  const existing = await db.select({ id: schema.users.id, handle: schema.users.handle }).from(schema.users).where(inArray(schema.users.handle, HANDLES));
  const missing = HANDLES.filter((h) => !existing.some((e) => e.handle === h));
  for (const handle of missing) {
    const email = `${handle}@example.invalid`;
    const [u] = await db
      .insert(schema.users)
      .values({ handle, emailEnc: encrypt(email), emailHash: blindIndex(email, "email"), passwordHash: pw, emailVerifiedAt: new Date(), approvedAt: new Date(), ageBracket: pick(["18-24", "25-34", "35-44"]) })
      .onConflictDoNothing()
      .returning({ id: schema.users.id, handle: schema.users.handle });
    if (u) existing.push(u);
  }
  return existing;
}

async function main() {
  if (process.argv.includes("--clear")) {
    const ids = (await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.handle, "demo\\_%"))).map((u) => u.id);
    if (ids.length) await db.delete(schema.posts).where(inArray(schema.posts.userId, ids));
    console.log("Demo posts removed");
    process.exit(0);
  }
  const users = await members();
  const titles = (await db.execute<{ id: number; kind: string; tmdb_id: number; name: string; year: number | null; poster_path: string | null }>(sql`
    select id, kind, tmdb_id, name, year, poster_path from titles order by (poster_path is null), random() limit 80
  `)).rows;
  if (!titles.length) throw new Error("No titles yet: open the home page once so TMDB fills the catalogue");
  const ref = (t: (typeof titles)[number]): TitleRef => ({ kind: t.kind, tmdbId: t.tmdb_id, name: t.name, year: t.year, poster: t.poster_path ? (t.poster_path.startsWith("http") ? t.poster_path : `https://image.tmdb.org/t/p/w342${t.poster_path}`) : null });
  const at = () => new Date(Date.now() - Math.random() * 10 * 86400_000);

  const created: string[] = [];
  for (let i = 0; i < 45; i++) {
    const t = pick(titles);
    const [p] = await db.insert(schema.posts).values({ userId: pick(users).id, titleId: t.id, body: pick(REVIEWS), createdAt: at() }).returning({ id: schema.posts.id });
    created.push(p.id);
  }
  for (let i = 0; i < 5; i++) {
    const items = shuffle(titles).slice(0, 5).map(ref);
    const [p] = await db
      .insert(schema.posts)
      .values({ userId: pick(users).id, kind: "top5", data: { title: pick(["Mon top 5 de l'année", "Top 5 pour pleurer", "Top 5 des films à revoir", "Top 5 du week-end", "Top 5 cultes"]), items }, createdAt: at() })
      .returning({ id: schema.posts.id });
    created.push(p.id);
  }
  for (let i = 0; i < 6; i++) {
    const [a, b] = shuffle(titles);
    const [p] = await db
      .insert(schema.posts)
      .values({ userId: pick(users).id, kind: "poll", data: { question: pick(["Lequel tu regardes ce soir ?", "Le meilleur des deux ?", "Lequel a la meilleure bande-son ?"]), options: [{ label: a.name }, { label: b.name }], answer: null }, createdAt: at() })
      .returning({ id: schema.posts.id });
    created.push(p.id);
    for (const u of shuffle(users).slice(0, 6)) await db.insert(schema.pollVotes).values({ postId: p.id, userId: u.id, option: Math.round(Math.random()) }).onConflictDoNothing();
  }
  for (let i = 0; i < 25; i++) {
    await db.insert(schema.posts).values({ userId: pick(users).id, parentId: pick(created), body: pick(REPLIES), createdAt: new Date() });
  }
  for (const id of created) {
    for (const u of shuffle(users).slice(0, Math.floor(Math.random() * 7))) await db.insert(schema.postLikes).values({ userId: u.id, postId: id }).onConflictDoNothing();
    if (Math.random() < 0.25) await db.insert(schema.posts).values({ userId: pick(users).id, repostOf: id });
  }
  console.log(`Demo feed: ${created.length} posts by ${users.length} demo members`);
  process.exit(0);
}

main();
