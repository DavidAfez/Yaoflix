import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="flex min-h-[80dvh] flex-col items-center justify-center gap-10 p-6 text-center">
      <p className="font-display text-[22vw] font-extrabold leading-none tracking-tighter md:text-[11vw]">
        4<span className="text-bone/25">0</span>4
      </p>
      <Link href="/" className="notch bg-lime px-8 py-4 font-semibold text-ink">
        {t("Accueil")}
      </Link>
    </main>
  );
}
