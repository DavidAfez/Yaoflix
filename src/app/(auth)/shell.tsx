import Link from "next/link";
import { Kinetic, Glow } from "@/components/kinetic";
import { LangSwitch } from "@/components/i18n";
import { getT } from "@/lib/i18n/server";

export async function AuthShell({ word, children }: { word: string; children: React.ReactNode }) {
  const t = await getT();
  return (
    <main className="relative grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <Glow />
      <section className="relative flex flex-col justify-between overflow-hidden border-line p-6 md:border-r md:p-12">
        <Link href="/" className="font-display text-lg font-extrabold">
          GABAOFLIX<span className="text-lime">.</span>
        </Link>
        <h1 className="mt-16 font-display text-[14.5vw] font-extrabold leading-[0.85] tracking-tighter md:mt-0 md:text-[7.2vw]">
          <Kinetic text={t(word)} />
        </h1>
        <ul className="mt-10 hidden gap-6 font-mono text-xs uppercase tracking-widest text-dim md:flex">
          <li>{t("Pseudo seul")}</li>
          <li className="text-lime">{t("Email chiffré")}</li>
          <li>{t("Zéro IP")}</li>
        </ul>
      </section>
      <section className="relative flex items-center p-6 md:p-12">
        <LangSwitch className="absolute right-4 top-4 md:right-8 md:top-8" />
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
