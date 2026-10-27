import { en } from "./en";

export type Locale = "fr" | "en";
export const LOCALES: Locale[] = ["fr", "en"];
export const LOCALE_COOKIE = "gf_lang";
export type Vars = Record<string, string | number>;

/**
 * French is the source language: the French text is the key, English comes from the dictionary.
 * A missing entry falls back to French, so nothing ever shows a raw key.
 */
export function translate(locale: Locale, fr: string, vars?: Vars): string {
  const text = locale === "en" ? (en[fr] ?? fr) : fr;
  return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : text;
}

export type T = (fr: string, vars?: Vars) => string;
export const makeT = (locale: Locale): T => (fr, vars) => translate(locale, fr, vars);

/** BCP 47 tag for dates and numbers. */
export const tag = (locale: Locale) => (locale === "en" ? "en-GB" : "fr-FR");
