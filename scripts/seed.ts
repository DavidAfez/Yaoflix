/**
 * npm run db:seed          creates the first DEV account from SEED_DEV_* env vars
 * npm run db:demo          same, plus fake members and activity to fill the dashboard
 */
import { eq } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { db, schema } from "@/db";
import { blindIndex, encrypt, normalizeEmail } from "@/lib/crypto";
import { ageBrackets } from "@/lib/labels";

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function ensureDev() {
  const handle = process.env.SEED_DEV_HANDLE ?? "root";
  const email = process.env.SEED_DEV_EMAIL;
  const password = process.env.SEED_DEV_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_DEV_EMAIL and SEED_DEV_PASSWORD");
  const emailHash = blindIndex(normalizeEmail(email), "email");
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.emailHash, emailHash));
  if (existing) {
    await db.update(schema.users).set({ role: "DEV" }).where(eq(schema.users.id, existing.id));
    console.log(`@${existing.handle} is DEV`);
    return existing.id;
  }
  const [u] = await db
    .insert(schema.users)
    .values({
      handle,
      emailEnc: encrypt(normalizeEmail(email)),
      emailHash,
      emailVerifiedAt: new Date(),
      passwordHash: await hash(password, ARGON),
      role: "DEV",
      ageBracket: "25-34",
    })
    .returning();
  console.log(`Created DEV @${handle}`);
  return u.id;
}

const pick = <T,>(xs: readonly T[], w?: number[]) => {
  if (!w) return xs[Math.floor(Math.random() * xs.length)];
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < xs.length; i++) if ((r -= w[i]) < 0) return xs[i];
  return xs[xs.length - 1];
};
const rand = (a: number, b: number) => Math.floor(a + Math.random() * (b - a));
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000 - rand(0, 86400_000));

const DEMO_TITLES: [string, number, string[]][] = [
  ["Dune : Deuxième partie", 2024, ["Science-fiction", "Aventure"]],
  ["Oppenheimer", 2023, ["Drame", "Histoire"]],
  ["Spider-Man : Across the Spider-Verse", 2023, ["Animation", "Action"]],
  ["Anatomie d'une chute", 2023, ["Drame", "Thriller"]],
  ["Le Comte de Monte-Cristo", 2024, ["Aventure", "Drame"]],
  ["Interstellar", 2014, ["Science-fiction", "Drame"]],
  ["Parasite", 2019, ["Thriller", "Comédie"]],
  ["La Haine", 1995, ["Drame", "Crime"]],
  ["Intouchables", 2011, ["Comédie", "Drame"]],
  ["Le Voyage de Chihiro", 2001, ["Animation", "Fantastique"]],
  ["Pulp Fiction", 1994, ["Crime", "Thriller"]],
  ["Get Out", 2017, ["Horreur", "Mystère"]],
  ["Barbie", 2023, ["Comédie", "Aventure"]],
  ["Past Lives", 2023, ["Romance", "Drame"]],
  ["Mad Max : Fury Road", 2015, ["Action", "Science-fiction"]],
  ["Les Misérables", 2019, ["Drame", "Crime"]],
  ["Gladiator II", 2024, ["Action", "Histoire"]],
  ["Le Fabuleux Destin d'Amélie Poulain", 2001, ["Comédie", "Romance"]],
  ["Alien : Romulus", 2024, ["Horreur", "Science-fiction"]],
  ["Coco", 2017, ["Animation", "Famille"]],
];

async function demo() {
  console.log("Seeding demo data...");
  const titles = await db
    .insert(schema.titles)
    .values(DEMO_TITLES.map(([name, year, genres], i) => ({ tmdbId: 900000 + i, kind: "movie", name, year, genres, popularity: 100 - i * 3, releaseDate: `${year}-06-01` })))
    .onConflictDoNothing()
    .returning();
  const all = titles.length ? titles : await db.select().from(schema.titles);

  const countries = ["FR", "FR", "FR", "BE", "CI", "SN", "CM", "CA", "CH", "MA"];
  const devices = ["mobile", "mobile", "mobile", "desktop", "tablet", "tv"];
  const pw = await hash("demo-password-123", ARGON);

  const users = [];
  for (let i = 0; i < 80; i++) {
    const email = `demo${i}@example.invalid`;
    const [u] = await db
      .insert(schema.users)
      .values({
        handle: `demo_${i}`,
        emailEnc: encrypt(email),
        emailHash: blindIndex(email, "email"),
        emailVerifiedAt: new Date(),
        passwordHash: pw,
        ageBracket: pick(ageBrackets, [4, 22, 30, 20, 14, 10]),
        sex: pick(["F", "M", "X", ""], [44, 46, 4, 6]) || null,
        country: pick(countries),
        role: i === 0 ? "MODERATOR" : i < 3 ? "UPLOADER" : "USER",
        createdAt: daysAgo(rand(0, 120)),
        lastSeenAt: daysAgo(rand(0, 10)),
      })
      .onConflictDoNothing()
      .returning();
    if (u) users.push(u);
  }

  // Taste by age: younger brackets lean on recent animation/action, older ones on drama and classics
  const affinity = (age: string | null, t: (typeof all)[number]) => {
    const recent = (t.year ?? 2000) >= 2020;
    let w = 1;
    if (age === "18-24" || age === "13-17") w += (recent ? 2 : 0) + (t.genres.includes("Animation") || t.genres.includes("Action") ? 2 : 0);
    if (age === "45-54" || age === "55+") w += (recent ? 0 : 2.5) + (t.genres.includes("Drame") ? 2 : 0);
    if (age === "25-34") w += t.genres.includes("Thriller") || t.genres.includes("Science-fiction") ? 2 : 0;
    return w;
  };

  const ready = all.slice(0, 12);
  const medias = [];
  for (const t of ready) {
    const [m] = await db
      .insert(schema.media)
      .values({ titleId: t.id, status: "READY", progress: 100, durationSec: rand(5400, 9000), renditions: [{ height: 720, bandwidth: 2_800_000 }], readyAt: daysAgo(rand(1, 60)) })
      .returning();
    medias.push({ m, t });
  }

  for (const u of users) {
    for (let k = 0; k < rand(1, 6); k++) {
      const t = pick(all, all.map((x) => affinity(u.ageBracket, x)));
      const status = pick(["PENDING", "FULFILLED", "REJECTED", "IN_PROGRESS"] as const, [3, 6, 2, 1]);
      await db.insert(schema.requests).values({
        userId: u.id,
        titleId: t.id,
        prefs: { quality: pick(["auto", "720", "1080", "2160"] as const, [5, 2, 4, 1]), audio: pick(["any", "vf", "vo"] as const, [3, 5, 2]), subs: pick(["none", "fr", "en"] as const, [6, 3, 1]) },
        status,
        rejectReason: status === "REJECTED" ? pick(["NOT_RELEASED", "NO_SOURCE", "LOW_QUALITY", "NO_LANGUAGE"] as const, [3, 4, 1, 1]) : null,
        ageBracket: u.ageBracket,
        sex: u.sex,
        country: u.country,
        recencyYears: t.year ? new Date().getFullYear() - t.year : null,
        createdAt: daysAgo(rand(0, 60)),
        handledAt: status === "PENDING" ? null : daysAgo(rand(0, 30)),
      });
    }

    for (let s = 0; s < rand(1, 8); s++) {
      const device = pick(devices);
      const startedAt = daysAgo(rand(0, 60));
      const activeSec = Math.round(Math.exp(Math.random() * 8.5));
      await db.insert(schema.platformSessions).values({ userId: u.id, startedAt, lastSeenAt: startedAt, activeSec, country: u.country, device, ageBracket: u.ageBracket, sex: u.sex });
    }

    for (let w = 0; w < rand(0, 5); w++) {
      const { m, t } = pick(medias, medias.map((x) => affinity(u.ageBracket, x.t)));
      const older = u.ageBracket === "45-54" || u.ageBracket === "55+";
      const spans = Array.from({ length: rand(1, 6) }, () => Math.round((older ? 900 : 400) + Math.random() * (older ? 2400 : 1500)));
      const [ws] = await db
        .insert(schema.watchSessions)
        .values({
          userId: u.id,
          mediaId: m.id,
          titleId: t.id,
          startedAt: daysAgo(rand(0, 60)),
          watchedSec: spans.reduce((a, b) => a + b, 0),
          pauses: spans.length - 1,
          completed: Math.random() > 0.35,
          country: u.country,
          device: pick(devices),
          ageBracket: u.ageBracket,
          sex: u.sex,
        })
        .returning();
      await db.insert(schema.focusSpans).values(spans.map((seconds, i) => ({ watchSessionId: ws.id, seconds, endedBy: i === spans.length - 1 ? "end" : "pause" })));
      if (Math.random() > 0.6) {
        await db.insert(schema.likes).values({ userId: u.id, titleId: t.id, value: Math.random() > 0.2 ? 1 : -1 }).onConflictDoNothing();
      }
    }
  }

  await db.insert(schema.errorLogs).values([
    { fingerprint: "demo-1", source: "player", message: "networkError:fragLoadTimeOut", count: 14, context: { grant: "demo" } },
    { fingerprint: "demo-2", source: "server", message: "TMDB 429 on /search/multi", count: 3, stack: "Error: TMDB 429\n    at tmdb (src/lib/tmdb.ts)" },
    { fingerprint: "demo-3", source: "mail", message: "connect ECONNREFUSED 127.0.0.1:587", count: 2 },
  ]).onConflictDoNothing();
  console.log(`Demo: ${users.length} members, ${all.length} titles, ${medias.length} online`);
}

await ensureDev();
if (process.argv.includes("--demo")) await demo();
process.exit(0);
