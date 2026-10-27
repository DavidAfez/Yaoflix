import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, makeT, type Locale } from ".";

/** The chosen language (cookie), else the browser's: French speakers get French, everyone else English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (c === "fr" || c === "en") return c;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^\s*fr\b/i.test(accept) || !accept ? "fr" : "en";
});

export async function getT() {
  return makeT(await getLocale());
}
