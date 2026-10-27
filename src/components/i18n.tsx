"use client";
import { createContext, useContext, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { makeT, tag, type Locale, type T } from "@/lib/i18n";
import { setLocale } from "@/app/locale";

const Ctx = createContext<Locale>("fr");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);

export function useT(): T {
  const locale = useContext(Ctx);
  return useMemo(() => makeT(locale), [locale]);
}

/** Date and number formatting in the member's language. */
export const useTag = () => tag(useContext(Ctx));

/** FR | EN switch. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const current = useContext(Ctx);
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={`flex font-mono text-xs ${pending ? "opacity-50" : ""} ${className}`} role="group" aria-label="Langue / Language">
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={current === l}
          onClick={() =>
            start(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
          className={`px-2 py-1 uppercase transition-colors ${current === l ? "text-lime" : "text-dim hover:text-bone"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
