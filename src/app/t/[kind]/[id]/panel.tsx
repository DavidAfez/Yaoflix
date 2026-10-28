"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useScroll, useTransform } from "motion/react";
import { Bookmark, BookmarkCheck, ThumbsDown, Heart, X, Check, Play, Eye, EyeOff, MessageSquare, ArrowLeft, Ban, SlidersHorizontal, Clapperboard } from "lucide-react";
import { Stars, useMark } from "@/components/marks";
import { fmtRating } from "@/lib/rating";
import { useT } from "@/components/i18n";
import { requestTitle, toggleWatchlist, watchNow } from "../../actions";
import { Button, Choice, Dots } from "@/components/ui";
import { StatusMark } from "@/components/status";
import { audioOptions, qualityOptions, subsOptions } from "@/lib/labels";
import type { RejectReason, RequestPrefs } from "@/db/schema";

type Props = {
  path: string;
  title: {
    id: number;
    tmdbId: number;
    name: string;
    year: number | null;
    runtime: number | null;
    genres: string[];
    overview: string | null;
    poster: string | null;
    backdrop: string | null;
    vote: number | null;
    kind: string;
    release: string | null;
    // Handle of the member who made it, for creator projects
    creator?: string | null;
  };
  state: {
    ready: boolean;
    grant: { id: string; expiresAt: string } | null;
    request: { status: "PENDING" | "IN_PROGRESS" | "FULFILLED" | "REJECTED"; reason: RejectReason | null } | null;
    listed: boolean;
    like: 1 | -1 | 0;
    verified: boolean;
  };
};

const fmtRuntime = (m: number | null) => (m ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : null);

export function TitlePanel({ path, title, state }: Props) {
  const t = useT();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const [listed, setListed] = useState(state.listed);
  // Likes, seen and reviews are shared with every poster through the marks context
  const mark = useMark({ kind: title.kind, tmdbId: title.tmdbId, name: title.name });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [prefs, setPrefs] = useState<RequestPrefs>({ quality: "auto", audio: "any", subs: "none" });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hero = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const bgO = useTransform(scrollYProgress, [0, 1], [1, 0.2]);

  // Brand new titles rarely have a source yet: say it before the member asks
  const age = title.release ? (Date.now() - new Date(title.release).getTime()) / 86400_000 : null;
  const fresh = !state.ready && !state.grant && age !== null && age < 31;
  const freshNote = fresh ? t(age! < 0 ? "Pas encore sorti." : "Sorti il y a moins d'un mois : peut-être pas encore dispo.") : null;

  const open = state.request && (state.request.status === "PENDING" || state.request.status === "IN_PROGRESS");
  const meta = [title.year, fmtRuntime(title.runtime), title.kind === "tv" ? t("Série") : null, ...title.genres.slice(0, 3).map((g) => t(g))].filter(Boolean);

  const send = () =>
    start(async () => {
      setError(null);
      const res = await requestTitle(title.id, prefs);
      if (!res.ok) return setError(t(res.error ?? "Oups"));
      if (res.watch) return router.push(res.watch);
      setSent(true);
      setTimeout(() => {
        setSheet(false);
        router.refresh();
      }, 1400);
    });


  let primary: React.ReactNode;
  if (state.grant) {
    primary = (
      <Button onClick={() => router.push(`/w/${state.grant!.id}`)}>
        <Play size={15} fill="currentColor" /> {t("Regarder")}
      </Button>
    );
  } else if (state.ready) {
    primary = (
      <Button disabled={pending} onClick={() => start(() => watchNow(title.id))}>
        {pending ? <Dots /> : <><Play size={15} fill="currentColor" /> {t("Regarder")}</>}
      </Button>
    );
  } else if (open) {
    primary = (
      <div className="flex h-11 items-center border-b border-line pr-2">
        <StatusMark status={state.request!.status} />
      </div>
    );
  } else if (title.creator) {
    // Nothing to request: the creator puts it online
    primary = <span className="flex h-11 items-center font-mono text-xs uppercase tracking-widest text-dim">{t("Bientôt en ligne")}</span>;
  } else {
    primary = (
      <Button onClick={() => setSheet(true)} disabled={!state.verified}>
        {t("Demander")}
      </Button>
    );
  }

  return (
    <>
      <div ref={hero} className="relative min-h-[64svh] overflow-hidden md:min-h-[66vh]">
        {title.backdrop && (
          <motion.div style={{ y: bgY, opacity: bgO }} className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={title.backdrop} alt="" className="size-full object-cover" />
          </motion.div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/80 to-transparent" />

        <Link
          href="/"
          className="absolute left-4 top-3 z-10 flex h-9 items-center gap-2 border border-bone/20 bg-ink/50 px-3 text-xs backdrop-blur transition-colors hover:border-lime hover:text-lime md:left-10 md:top-5"
        >
          <ArrowLeft size={14} /> {t("Accueil")}
        </Link>

        <div className="relative flex min-h-[64svh] flex-col justify-end gap-6 px-4 pb-8 pt-16 md:min-h-[66vh] md:flex-row md:items-end md:justify-start md:px-10 md:pb-10">
          {title.poster && (
            <motion.img
              initial={{ opacity: 0, y: 40, rotate: -3 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              src={title.poster}
              alt=""
              className="hidden w-40 shadow-2xl shadow-black/60 md:block lg:w-44"
            />
          )}
          <div className="max-w-2xl space-y-4">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-3xl font-extrabold leading-[0.95] tracking-tight md:text-5xl"
            >
              {title.name}
            </motion.h1>
            {title.creator && (
              <Link href={`/u/${title.creator}`} className="inline-flex items-center gap-2 border border-lime/40 bg-lime/10 px-3 py-1 text-xs transition-colors hover:border-lime">
                <Clapperboard size={13} className="text-lime" /> {t("Projet de @{h}", { h: title.creator })}
              </Link>
            )}
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-bone/70">
              {meta.map((m, i) => (
                <span key={i}>{m}</span>
              ))}
              {title.vote ? <span className="text-lime">★ {title.vote.toFixed(1)}</span> : null}
            </motion.p>
            {title.overview && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="line-clamp-4 max-w-xl text-sm leading-relaxed text-bone/80 md:line-clamp-5">
                {title.overview}
              </motion.p>
            )}
            {state.request?.status === "REJECTED" && !state.ready && <StatusMark status="REJECTED" reason={state.request.reason} />}
            {freshNote && (
              <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }} className="border-l-2 border-coral pl-3 text-sm text-bone">
                {freshNote}
              </motion.p>
            )}

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="flex flex-wrap items-center gap-1.5 pt-1">
              {/* Phone: the main action takes its own line, the icons line up below */}
              <div className="w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">{primary}</div>
              <IconToggle
                on={listed}
                label={t("Liste")}
                onClick={() => {
                  setListed(!listed);
                  void toggleWatchlist(title.id, path);
                }}
              >
                {listed ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              </IconToggle>
              {mark && (
                <>
                  <IconToggle on={mark.liked} label={t("J'aime")} onClick={mark.toggleLike} tone="coral">
                    <Heart size={16} fill={mark.liked ? "currentColor" : "none"} />
                  </IconToggle>
                  <IconToggle on={mark.disliked} label={t("Bof")} onClick={mark.toggleDislike} tone="coral">
                    <ThumbsDown size={16} />
                  </IconToggle>
                  <IconToggle on={mark.seen} label={t(mark.seen ? "Vu" : "Déjà vu")} onClick={mark.toggleSeen} >
                    {mark.seen ? <EyeOff size={16} /> : <Eye size={16} />}
                  </IconToggle>
                  <IconToggle on={mark.reviewed} label={t("Avis")} onClick={mark.review}>
                    <MessageSquare size={16} fill={mark.reviewed ? "currentColor" : "none"} />
                  </IconToggle>
                  {mark.deep && (
                    <IconToggle on={false} label={t("Analyse")} onClick={mark.analyse}>
                      <SlidersHorizontal size={16} />
                    </IconToggle>
                  )}
                  <IconToggle on={mark.never} label={t("Jamais")} onClick={mark.toggleNever} tone="coral">
                    <Ban size={16} />
                  </IconToggle>
                </>
              )}
            </motion.div>
            {mark && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="flex items-center gap-4">
                <Stars value={mark.rating} onChange={mark.rate} size={16} />
                {mark.rating > 0 && <span className="font-mono text-xs text-lime">{fmtRating(mark.rating)}/5</span>}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {mounted && createPortal(
      <AnimatePresence>
        {sheet && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)} className="fixed inset-0 z-[60] bg-ink/70 backdrop-blur-sm" />
            <motion.div
              role="dialog"
              aria-label={t("Demande")}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, i) => i.offset.y > 120 && setSheet(false)}
              className="fixed inset-x-0 bottom-0 z-[70] border-t-2 border-lime bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4 md:left-auto md:top-0 md:w-[440px] md:border-l-2 md:border-t-0 md:px-8 md:pt-10"
            >
              <div className="mx-auto mb-6 h-1 w-10 bg-bone/20 md:hidden" />
              <div className="mb-8 flex items-start justify-between gap-4">
                <p className="font-display text-2xl font-semibold leading-tight">{title.name}</p>
                <button onClick={() => setSheet(false)} aria-label={t("Fermer")} className="text-dim hover:text-bone">
                  <X />
                </button>
              </div>
              <AnimatePresence mode="wait">
                {sent ? (
                  <motion.div key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid place-items-center py-16">
                    <motion.div initial={{ rotate: -90 }} animate={{ rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 12 }} className="grid size-24 place-items-center rounded-full bg-lime text-ink">
                      <Check size={44} strokeWidth={3} />
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div key="form" exit={{ opacity: 0, y: 10 }} className="space-y-7">
                    <Choice name="quality" label="Qualité" value={prefs.quality} options={qualityOptions} onChange={(quality) => setPrefs({ ...prefs, quality })} />
                    <Choice name="audio" label="Audio" value={prefs.audio} options={audioOptions} onChange={(audio) => setPrefs({ ...prefs, audio })} />
                    <Choice name="subs" label="Sous-titres" value={prefs.subs} options={subsOptions} onChange={(subs) => setPrefs({ ...prefs, subs })} />
                    {freshNote && <p className="border-l-2 border-coral pl-3 text-sm">{freshNote}</p>}
                    {error && <p className="text-sm text-coral">{error}</p>}
                    <Button size="lg" className="w-full" onClick={send} disabled={pending}>
                      {pending ? <Dots /> : t("Envoyer")}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </>
  );
}

function IconToggle({
  on,
  onClick,
  label,
  children,
  tone = "lime",
  text,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  tone?: "lime" | "coral";
  text?: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={`flex h-10 items-center justify-center gap-2 border transition-colors sm:h-11 ${text ? "px-3 text-sm" : "w-10 sm:w-11"} ${
        on ? (tone === "lime" ? "border-lime text-lime" : "border-coral text-coral") : "border-line text-bone/70 hover:border-bone/40 hover:text-bone"
      }`}
    >
      <motion.span key={String(on)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 15 }}>
        {children}
      </motion.span>
      {text && <span>{text}</span>}
    </motion.button>
  );
}
