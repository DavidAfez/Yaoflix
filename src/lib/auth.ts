import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db, schema } from "@/db";
import type { Role, User } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";

const COOKIE = "yf_s";
const SESSION_DAYS = 30;

// OWASP recommended argon2id parameters
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, ARGON);
export const verifyPassword = (digest: string, pw: string) => verify(digest, pw).catch(() => false);

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(schema.sessions).values({ id: sha256(token), userId, expiresAt });
  // Opportunistic cleanup of expired sessions
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(COOKIE);
}

export type SessionUser = Pick<
  User,
  "id" | "handle" | "role" | "ageBracket" | "sex" | "country" | "emailVerifiedAt" | "whatsappOptIn"
> & { hasPhone: boolean };

/** Resolve the current user once per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      id: schema.users.id,
      handle: schema.users.handle,
      role: schema.users.role,
      ageBracket: schema.users.ageBracket,
      sex: schema.users.sex,
      country: schema.users.country,
      emailVerifiedAt: schema.users.emailVerifiedAt,
      whatsappOptIn: schema.users.whatsappOptIn,
      phoneHash: schema.users.phoneHash,
      bannedAt: schema.users.bannedAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.bannedAt) return null;
  const { phoneHash, bannedAt: _b, ...user } = row;
  return { ...user, hasPhone: Boolean(phoneHash) };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(check: (r: Role) => boolean): Promise<SessionUser> {
  const user = await requireUser();
  if (!check(user.role)) redirect("/");
  return user;
}

/** For route handlers: returns null instead of redirecting. */
export async function apiUser(check?: (r: Role) => boolean): Promise<SessionUser | null> {
  const user = await getUser();
  if (!user) return null;
  if (check && !check(user.role)) return null;
  return user;
}
