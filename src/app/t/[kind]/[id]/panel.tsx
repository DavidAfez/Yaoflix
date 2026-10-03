"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useScroll, useTransform } from "motion/react";
import { Bookmark, BookmarkCheck, ThumbsDown, ThumbsUp, X, Check, Play } from "lucide-react";
import { requestTitle, setLike, toggleWatchlist, watchNow } from "../../actions";
import { Button, Choice, Dots } from "@/components/ui";
import { StatusMark } from "@/components/status";
import { audioOptions, qualityOptions, subsOptions } from "@/lib/labels";
import type { RejectReason, RequestPrefs } from "@/db/schema";

type Props = {
  path: string;
  title: {
    id: number;
    name: string;
    year: number | null;
    runtime: number | null;
    genres: string[];
    overview: string | null;
    poster: string | null;
    backdrop: string | null;
    vote: number | null;
    kind: string;
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
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const [listed, setListed] = useState(state.listed);
  const [like, setLikeState] = useState(state.like);
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

  const open = state.request && (state.request.status === "PENDING" || state.request.status === "IN_PROGRESS");
  const meta = [title.year, fmtRuntime(title.runtime), title.kind === "tv" ? "Série" : null, ...title.genres.slice(0, 3)].filter(Boolean);

  const send = () =>
    start(async () => {
      setError(null);
      const res = await requestTitle(title.id, prefs);
      if (!res.ok) return setError(res.error ?? "Oups");
      if (res.watch) return router.push(res.watch);
      setSent(true);
      setTimeout(() => {
        setSheet(false);
        router.refresh();
      }, 1400);
    });

  const vote = (v: 1 | -1) => {
    const next = like === v ? 0 : v;
    setLikeState(next);
    void setLike(title.id, next, path);
  };

  let primary: React.ReactNode;
  if (state.grant) {
    primary = (
      <Button size="lg" onClick={() => router.push(`/w/${state.grant!.id}`)}>
        <Play size={18} fill="currentColor" /> Regarder
      </Button>
    );
  } else if (state.ready) {
    primary = (
      <Button size="lg" disabled={pending} onClick={() => start(() => watchNow(title.id))}>
        {pending ? <Dots /> : <><Play size={18} fill="currentColor" /> Regarder</>}
      </Button>
    );
  } else if (open) {
    primary = (
      <div className="flex h-14 items-center border-b border-line pr-2">
        <StatusMark status={state.request!.status} />
      </div>
    );
  } else {
    primary = (
      <Button size="lg" onClick={() => setSheet(true)} disabled={!state.verified}>
        Demander
      </Button>
    );
  }

  return (
    <>
      <div ref={hero} className="relative min-h-[88svh] overflow-hidden md:min-h-[86vh]">
        {title.backdrop && (
          <motion.div style={{ y: bgY, opacity: bgO }} className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={title.backdrop} alt="" className="size-full object-cover" />
          </motion.div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/80 to-transparent" />

        <div className="relative flex min-h-[88svh] flex-col justify-end gap-8 px-4 pb-10 md:min-h-[86vh] md:flex-row md:items-end md:px-10 md:pb-14">
          {title.poster && (
            <motion.img
              initial={{ opacity: 0, y: 40, rotate: -3 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              src={title.poster}
              alt=""
              className="hidden w-60 shadow-2xl shadow-black/60 md:block"
            />
          )}
          <div className="max-w-3xl space-y-5">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight md:text-7xl"
            >
              {title.name}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-wider text-bone/70">
              {meta.map((m, i) => (
                <span key={i}>{m}</span>
              ))}
              {title.vote ? <span className="text-lime">★ {title.vote.toFixed(1)}</span> : null}
            </motion.p>
            {title.overview && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="line-clamp-4 max-w-2xl leading-relaxed text-bone/80 md:line-clamp-none">
                {title.overview}
              </motion.p>
            )}
            {state.request?.status === "REJECTED" && !state.ready && <StatusMark status="REJECTED" reason={state.request.reason} />}

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="flex items-center gap-2 pt-2">
              {primary}
              <IconToggle
                on={listed}
                label="Liste"
                onClick={() => {
                  setListed(!listed);
                  void toggleWatchlist(title.id, path);
                }}
              >
                {listed ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
              </IconToggle>
              <IconToggle on={like === 1} label="J'aime" onClick={() => vote(1)}>
                <ThumbsUp size={19} />
              </IconToggle>
              <IconToggle on={like === -1} label="Bof" onClick={() => vote(-1)} tone="coral">
                <ThumbsDown size={19} />
              </IconToggle>
            </motion.div>
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
              aria-label="Demande"
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
                <button onClick={() => setSheet(false)} aria-label="Fermer" className="text-dim hover:text-bone">
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
                    {error && <p className="text-sm text-coral">{error}</p>}
                    <Button size="lg" className="w-full" onClick={send} disabled={pending}>
                      {pending ? <Dots /> : "Envoyer"}
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
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  tone?: "lime" | "coral";
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={`grid size-14 place-items-center border transition-colors ${
        on ? (tone === "lime" ? "border-lime text-lime" : "border-coral text-coral") : "border-line text-bone/70 hover:border-bone/40 hover:text-bone"
      }`}
    >
      <motion.span key={String(on)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 15 }}>
        {children}
      </motion.span>
    </motion.button>
  );
}
