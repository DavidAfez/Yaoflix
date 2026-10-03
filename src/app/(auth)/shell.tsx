import Link from "next/link";
import { Kinetic, Glow } from "@/components/kinetic";

export function AuthShell({ word, children }: { word: string; children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <Glow />
      <section className="relative flex flex-col justify-between overflow-hidden border-line p-6 md:border-r md:p-12">
        <Link href="/" className="font-display text-lg font-extrabold">
          YAO<span className="text-lime">.</span>
        </Link>
        <h1 className="mt-16 font-display text-[18vw] font-extrabold leading-[0.85] tracking-tighter md:mt-0 md:text-[9vw]">
          <Kinetic text={word} />
        </h1>
        <ul className="mt-10 hidden gap-6 font-mono text-xs uppercase tracking-widest text-dim md:flex">
          <li>Pseudo seul</li>
          <li className="text-lime">Email chiffré</li>
          <li>Zéro IP</li>
        </ul>
      </section>
      <section className="relative flex items-center p-6 md:p-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
