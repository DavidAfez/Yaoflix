"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { blindIndex, encrypt, normalizeEmail, randomToken, sha256 } from "@/lib/crypto";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { countryFrom } from "@/lib/context";
import { queueMail } from "@/lib/jobs";
import { rateLimit } from "@/lib/ratelimit";
import { ageBrackets } from "@/lib/labels";
import { logError } from "@/lib/errors";

export type AuthState = { error?: string; sent?: boolean } | undefined;

const APP = () => process.env.APP_URL ?? "http://localhost:3000";

/** The IP is only used in memory to throttle abuse. It is hashed and never written anywhere. */
async function throttle(scope: string, capacity: number, perSec: number) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
  return rateLimit(`${scope}:${sha256(ip)}`, capacity, perSec);
}

async function issueToken(userId: string, kind: "verify" | "reset", ttlMin: number) {
  const token = randomToken();
  await db.insert(schema.authTokens).values({
    tokenHash: sha256(token),
    userId,
    kind,
    expiresAt: new Date(Date.now() + ttlMin * 60_000),
  });
  return token;
}

const joinSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,20}$/, "Pseudo : 3 à 20 caractères, lettres, chiffres, _ ou ."),
  email: z.email("Email invalide").max(254),
  password: z.string().min(10, "10 caractères minimum").max(200),
  age: z.enum(ageBrackets, "Choisis ta tranche d'âge"),
  sex: z.enum(["F", "M", "X", ""]).optional(),
});

export async function join(_: AuthState, form: FormData): Promise<AuthState> {
  if (!(await throttle("join", 5, 600))) return { error: "Trop d'essais. Reviens dans quelques minutes." };
  const parsed = joinSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { handle, email, password, age, sex } = parsed.data;
  const emailHash = blindIndex(normalizeEmail(email), "email");

  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle));
  if (taken) return { error: "Pseudo déjà pris" };

  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.emailHash, emailHash));
  if (existing) {
    // Same answer as a fresh signup, so nobody can probe which emails have an account
    await queueMail(existing.id, "reset", { link: `${APP()}/reset/${await issueToken(existing.id, "reset", 60)}` });
    return { sent: true };
  }

  try {
    const [user] = await db
      .insert(schema.users)
      .values({
        handle,
        emailEnc: encrypt(normalizeEmail(email)),
        emailHash,
        passwordHash: await hashPassword(password),
        ageBracket: age,
        sex: sex || null,
        country: countryFrom(await headers()),
      })
      .returning({ id: schema.users.id });
    const token = await issueToken(user.id, "verify", 60 * 24);
    await queueMail(user.id, "verify", { link: `${APP()}/verify/${token}` });
  } catch (e) {
    await logError("server", e, { where: "join" });
    return { error: "Oups. Réessaie." };
  }
  return { sent: true };
}

// Dummy hash so a missing account takes as long as a wrong password
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword(randomToken()));

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  if (!(await throttle("login", 8, 300))) return { error: "Trop d'essais. Reviens dans quelques minutes." };
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.emailHash, blindIndex(normalizeEmail(email), "email")))
    .limit(1);
  const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password);
  if (!user || !ok) return { error: "Email ou mot de passe incorrect" };
  if (user.bannedAt) return { error: "Compte suspendu" };
  if (!user.emailVerifiedAt) {
    const token = await issueToken(user.id, "verify", 60 * 24);
    await queueMail(user.id, "verify", { link: `${APP()}/verify/${token}` });
    return { error: "Confirme ton adresse, on vient de te renvoyer le lien." };
  }
  await createSession(user.id);
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function forgot(_: AuthState, form: FormData): Promise<AuthState> {
  if (!(await throttle("forgot", 4, 600))) return { sent: true };
  const email = String(form.get("email") ?? "");
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.emailHash, blindIndex(normalizeEmail(email), "email")));
  if (user) await queueMail(user.id, "reset", { link: `${APP()}/reset/${await issueToken(user.id, "reset", 60)}` });
  return { sent: true };
}

async function consume(token: string, kind: "verify" | "reset") {
  const [row] = await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.authTokens.tokenHash, sha256(token)),
        eq(schema.authTokens.kind, kind),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: schema.authTokens.userId });
  return row?.userId ?? null;
}

/** Not a form action: called by the /verify route handler. */
export async function verifyEmail(token: string) {
  const userId = await consume(token, "verify");
  if (!userId) return false;
  await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, userId));
  await createSession(userId);
  return true;
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 10) return { error: "10 caractères minimum" };
  const userId = await consume(String(form.get("token") ?? ""), "reset");
  if (!userId) return { error: "Lien expiré" };
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), emailVerifiedAt: new Date() })
    .where(eq(schema.users.id, userId));
  // Kill every other session
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  await createSession(userId);
  redirect("/");
}
