import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { resolveGrant } from "@/lib/access";
import { img, localize } from "@/lib/tmdb";
import { Player } from "@/components/player/player";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Visionnage"), referrer: "no-referrer" };
}

export default async function Page(props: PageProps<"/w/[key]">) {
  const { key } = await props.params;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/w/${key}`)}`);
  if (!user.approved) redirect("/pending");
  const g = await resolveGrant(key, user.id);
  if (!g) {
    const t = await getT();
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-10 p-6 text-center">
        <p className="font-display text-6xl font-extrabold tracking-tighter md:text-8xl">
          {t("Lien")}
          <br />
          <span className="text-bone/25">{t("expiré.")}</span>
        </p>
        <Link href="/" className="notch bg-lime px-8 py-4 font-semibold text-ink">
          {t("Accueil")}
        </Link>
      </main>
    );
  }
  const duration = g.media.durationSec ?? 0;
  const resume = g.grant.lastPositionSec < duration - 90 ? g.grant.lastPositionSec : 0;
  return (
    <main className="fixed inset-0 z-[80] bg-black">
      <Player
        grantId={g.grant.id}
        grantKey={key}
        titleId={g.title.id}
        title={(await localize([g.title]))[0].name}
        backdrop={img(g.title.backdropPath, "w1280")}
        resumeAt={resume}
        prefs={g.grant.prefs}
        subtitles={g.media.subtitles.filter((s) => s.file)}
        canCapture={can.capture(user.role)}
      />
    </main>
  );
}
