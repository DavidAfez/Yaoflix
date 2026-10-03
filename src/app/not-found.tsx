import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[80dvh] flex-col items-center justify-center gap-10 p-6 text-center">
      <p className="font-display text-[28vw] font-extrabold leading-none tracking-tighter md:text-[14vw]">
        4<span className="text-bone/25">0</span>4
      </p>
      <Link href="/" className="notch bg-lime px-8 py-4 font-semibold text-ink">
        Accueil
      </Link>
    </main>
  );
}
