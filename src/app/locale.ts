"use server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";

/** Remembers the language in a cookie, and on the account so mails follow it. */
export async function setLocale(locale: Locale) {
  if (locale !== "fr" && locale !== "en") return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await getUser();
  if (user) await db.update(schema.users).set({ locale }).where(eq(schema.users.id, user.id));
}
