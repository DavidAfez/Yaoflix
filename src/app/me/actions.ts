"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, verifyPassword, destroySession } from "@/lib/auth";
import { blindIndex, encrypt, normalizePhone } from "@/lib/crypto";
import { ageBrackets } from "@/lib/labels";

export type MeState = { ok?: boolean; error?: string } | undefined;

export async function saveProfile(_: MeState, form: FormData): Promise<MeState> {
  const user = await requireUser();
  const parsed = z
    .object({
      handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,20}$/, "Pseudo : 3 à 20 caractères, lettres, chiffres, _ ou ."),
      age: z.enum(ageBrackets, "Choisis ta tranche d'âge"),
      sex: z.enum(["F", "M", "X", ""]),
    })
    .safeParse({ handle: form.get("handle") ?? user.handle, age: form.get("age"), sex: form.get("sex") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalide" };
  if (parsed.data.handle !== user.handle) {
    const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, parsed.data.handle));
    if (taken) return { error: "Pseudo déjà pris" };
  }
  await db
    .update(schema.users)
    .set({ handle: parsed.data.handle, ageBracket: parsed.data.age, sex: parsed.data.sex || null })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/me");
  return { ok: true };
}

/** The number is encrypted like the email; the blind index lets incoming WhatsApp voice notes find the account. */
export async function saveWhatsApp(_: MeState, form: FormData): Promise<MeState> {
  const user = await requireUser();
  const raw = String(form.get("phone") ?? "").trim();
  const optIn = form.get("optin") === "on";
  if (!raw) {
    await db.update(schema.users).set({ phoneEnc: null, phoneHash: null, whatsappOptIn: false }).where(eq(schema.users.id, user.id));
    revalidatePath("/me");
    return { ok: true };
  }
  const phone = normalizePhone(raw);
  if (!/^\+\d{8,15}$/.test(phone)) return { error: "Format +33..." };
  const phoneHash = blindIndex(phone.replace(/^\+/, ""), "phone");
  const [other] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phoneHash, phoneHash));
  if (other && other.id !== user.id) return { error: "Numéro déjà utilisé" };
  await db
    .update(schema.users)
    .set({ phoneEnc: encrypt(phone), phoneHash, whatsappOptIn: optIn })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteAccount(_: MeState, form: FormData): Promise<MeState> {
  const user = await requireUser();
  const [row] = await db.select({ pw: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!row || !(await verifyPassword(row.pw, String(form.get("password") ?? "")))) return { error: "Mot de passe incorrect" };
  await destroySession();
  // Cascades remove sessions, likes, watchlist, grants. Analytics rows keep only anonymous snapshots.
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  redirect("/");
}

const BILLBOARD = [0, 1500, 3000, 5000, 8000];

/** Time per slide of the home billboard, 0 keeps it still. */
export async function saveBillboard(ms: number) {
  const user = await requireUser();
  if (!BILLBOARD.includes(ms)) return;
  await db.update(schema.users).set({ billboardMs: ms }).where(eq(schema.users.id, user.id));
  revalidatePath("/");
}

const ref = z.object({
  kind: z.enum(["movie", "tv"]),
  tmdbId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  year: z.number().int().nullable(),
  poster: z.string().startsWith("https://image.tmdb.org/").max(300).nullable(),
});

/** A new version of the profile top 5. The previous one stays in the history. */
export async function saveTop5(items: unknown) {
  const user = await requireUser();
  const parsed = z.array(ref).min(1).max(5).safeParse(items);
  if (!parsed.success) return { ok: false };
  await db.update(schema.topLists).set({ archivedAt: new Date() }).where(and(eq(schema.topLists.userId, user.id), isNull(schema.topLists.archivedAt)));
  await db.insert(schema.topLists).values({ userId: user.id, items: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Bio, avatar and banner. Pictures must be the member's own uploads. */
export async function saveProfileCard(input: { bio: string; avatarId: string | null; bannerId: string | null }) {
  const user = await requireUser();
  const parsed = z.object({ bio: z.string().trim().max(160), avatarId: z.uuid().nullable(), bannerId: z.uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalide" };
  const ids = [parsed.data.avatarId, parsed.data.bannerId].filter((x): x is string => Boolean(x));
  if (ids.length) {
    const own = await db.select({ id: schema.images.id }).from(schema.images).where(and(eq(schema.images.userId, user.id), inArray(schema.images.id, ids)));
    if (own.length !== new Set(ids).size) return { ok: false, error: "Interdit" };
  }
  await db.update(schema.users).set({ bio: parsed.data.bio || null, avatarId: parsed.data.avatarId, bannerId: parsed.data.bannerId }).where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
