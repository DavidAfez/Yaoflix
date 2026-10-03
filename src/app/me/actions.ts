"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, verifyPassword, destroySession } from "@/lib/auth";
import { blindIndex, encrypt, normalizePhone } from "@/lib/crypto";
import { ageBrackets } from "@/lib/labels";

export type MeState = { ok?: boolean; error?: string } | undefined;

export async function saveProfile(_: MeState, form: FormData): Promise<MeState> {
  const user = await requireUser();
  const parsed = z
    .object({ age: z.enum(ageBrackets), sex: z.enum(["F", "M", "X", ""]) })
    .safeParse({ age: form.get("age"), sex: form.get("sex") ?? "" });
  if (!parsed.success) return { error: "Invalide" };
  await db.update(schema.users).set({ ageBracket: parsed.data.age, sex: parsed.data.sex || null }).where(eq(schema.users.id, user.id));
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
