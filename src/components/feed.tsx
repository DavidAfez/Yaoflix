"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Clapperboard, Heart, MessageCircle, Mic, Repeat2, Trash2, X } from "lucide-react";
import { createPost, deletePost, setFollow, toggleFav, toggleRepost } from "@/app/feed/actions";
import { StarShape, Stars, useMark } from "./marks";
import { Dots } from "./ui";
import { fmtRating } from "@/lib/rating";
import type { FeedPost } from "@/lib/feed";
import type { PosterData } from "./poster";

function ago(iso: string) {
  const m = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (m < 1) return "à l'instant";
  if (m < 60) return `${Math.floor(m)} min`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h`;
  if (m < 60 * 24 * 30) return `${Math.floor(m / 1440)} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/** Title block on top of a post: poster, name, year and the author's stars. */
function TitleBlock({ t, rating }: { t: NonNullable<FeedPost["title"]>; rating: number | null }) {
  return (
    <Link href={`/t/${t.kind}/${t.tmdbId}`} className="flex items-center gap-3 border border-line bg-ink-2 p-2 pr-4 transition-colors hover:border-lime">
      <div className="grid h-16 w-11 shrink-0 place-items-center overflow-hidden bg-ink-3 font-display text-lg font-extrabold text-bone/15">
        {t.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.poster} alt="" className="size-full object-cover" />
        ) : (
          t.name.charAt(0)
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-semibold">{t.name}</p>
        <p className="mt-1 flex items-center gap-3 font-mono text-[11px] text-dim">
          {t.year}
          {t.kind === "tv" && <span className="uppercase">Série</span>}
          {rating ? (
            <span className="flex items-center gap-0.5" aria-label={`${fmtRating(rating)} sur 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <StarShape key={n} fill={Math.max(0, Math.min(1, rating - (n - 1)))} size={11} />
              ))}
            </span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}

export function PostCard({ p, i = 0, big = false }: { p: FeedPost; i?: number; big?: boolean }) {
  const router = useRouter();
  const [liked, setLiked] = useState(p.liked);
  const [reposted, setReposted] = useState(p.reposted);
  const [gone, setGone] = useState(false);
  const [, start] = useTransition();
  useEffect(() => {
    setLiked(p.liked);
    setReposted(p.reposted);
  }, [p.liked, p.reposted]);
  if (gone) return null;
  const likes = p.likes - Number(p.liked) + Number(liked);
  const reposts = p.reposts - Number(p.reposted) + Number(reposted);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 10) * 0.03, duration: 0.4 }}
      className="border-b border-line px-4 py-5 md:px-6"
    >
      {p.repostedBy && (
        <p className="mb-2 flex items-center gap-2 font-mono text-[11px] text-dim">
          <Repeat2 size={13} className="text-lime" /> @{p.repostedBy}
        </p>
      )}
      <header className="mb-3 flex items-center gap-3">
        <Link href={`/u/${p.handle}`} className="grid size-9 shrink-0 place-items-center bg-lime font-display font-extrabold uppercase text-ink">
          {p.handle.charAt(0)}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${p.handle}`} className="font-mono text-sm hover:text-lime">
            @{p.handle}
          </Link>
          {p.replyTo && <span className="ml-2 font-mono text-[11px] text-dim">↳ @{p.replyTo}</span>}
        </div>
        <Link href={`/p/${p.id}`} className="font-mono text-[11px] text-dim hover:text-bone">
          {ago(p.at)}
        </Link>
      </header>

      {p.title && !p.replyTo && (
        <div className="mb-3">
          <TitleBlock t={p.title} rating={p.rating} />
        </div>
      )}

      <Link href={`/p/${p.id}`} className="block">
        {p.body ? (
          <p className={`whitespace-pre-line leading-relaxed ${big ? "text-lg md:text-xl" : ""}`}>
            {p.voice && <Mic size={14} className="mr-2 inline align-[-2px] text-lime" aria-label="Vocal" />}
            {p.body}
          </p>
        ) : (
          p.voice && (
            <p className="flex items-center gap-2 font-mono text-xs text-dim">
              <Mic size={14} className="text-lime" /> Vocal
            </p>
          )
        )}
      </Link>

      <footer className="mt-4 flex items-center gap-8 text-dim">
        <Link href={`/p/${p.id}`} className="flex items-center gap-2 text-sm transition-colors hover:text-ice" aria-label="Répondre">
          <MessageCircle size={17} /> <span className="font-mono text-xs tabular-nums">{p.replies || ""}</span>
        </Link>
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => {
            setReposted(!reposted);
            start(() => toggleRepost(p.id, !reposted));
          }}
          aria-label="Reposter"
          aria-pressed={reposted}
          className={`flex items-center gap-2 text-sm transition-colors ${reposted ? "text-lime" : "hover:text-lime"}`}
        >
          <Repeat2 size={18} /> <span className="font-mono text-xs tabular-nums">{reposts || ""}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => {
            setLiked(!liked);
            start(() => toggleFav(p.id, !liked));
          }}
          aria-label="Favori"
          aria-pressed={liked}
          className={`flex items-center gap-2 text-sm transition-colors ${liked ? "text-coral" : "hover:text-coral"}`}
        >
          <motion.span key={String(liked)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 14 }}>
            <Heart size={17} fill={liked ? "currentColor" : "none"} />
          </motion.span>
          <span className="font-mono text-xs tabular-nums">{likes || ""}</span>
        </motion.button>
        {p.mine && (
          <button
            onClick={() => {
              setGone(true);
              start(async () => {
                await deletePost(p.id);
                if (big) router.push("/feed");
              });
            }}
            aria-label="Supprimer"
            title="Supprimer"
            className="ml-auto transition-colors hover:text-coral"
          >
            <Trash2 size={15} />
          </button>
        )}
      </footer>
    </motion.article>
  );
}

/** Writes a post, optionally about a title (picked with the search) and with stars. With parentId, a reply. */
export function Composer({ parentId, placeholder = "Ton avis, ta théorie, ta reco" }: { parentId?: string; placeholder?: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [title, setTitle] = useState<PosterData | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const send = () =>
    start(async () => {
      setError(null);
      const res = await createPost({ body, parentId, kind: title?.kind as "movie" | "tv" | undefined, tmdbId: title?.tmdbId });
      if (!res.ok) return setError(res.error ?? "Oups");
      setBody("");
      setTitle(null);
      router.refresh();
    });

  return (
    <div className="border-b border-line px-4 py-5 md:px-6">
      {title && <PickedTitle t={title} onClear={() => setTitle(null)} />}
      <textarea
        ref={area}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent text-lg outline-none placeholder:text-bone/30"
      />
      <AnimatePresence>{picking && <TitlePicker onPick={(t) => (setTitle(t), setPicking(false))} onClose={() => setPicking(false)} />}</AnimatePresence>
      {error && <p className="mt-2 text-sm text-coral">{error}</p>}
      <div className="mt-3 flex items-center justify-between gap-4">
        {!parentId ? (
          <button
            type="button"
            onClick={() => setPicking(!picking)}
            className={`flex h-10 items-center gap-2 border px-3 text-sm transition-colors ${picking || title ? "border-lime text-lime" : "border-line text-bone/70 hover:border-bone/40"}`}
          >
            <Clapperboard size={16} /> Film ou série
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-4">
          {body.length > 800 && <span className="font-mono text-xs text-dim">{1000 - body.length}</span>}
          <button onClick={send} disabled={!body.trim() || pending} className="notch flex h-10 min-w-24 items-center justify-center bg-lime px-5 text-sm font-semibold text-ink disabled:opacity-40">
            {pending ? <Dots /> : parentId ? "Répondre" : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickedTitle({ t, onClear }: { t: PosterData; onClear: () => void }) {
  const mark = useMark(t);
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 flex flex-wrap items-center gap-4 border border-line bg-ink-2 p-2 pr-3">
      <div className="h-14 w-10 shrink-0 overflow-hidden bg-ink-3">
        {t.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.poster} alt="" className="size-full object-cover" />
        )}
      </div>
      <p className="min-w-0 flex-1 truncate font-display text-sm font-semibold">
        {t.name} <span className="font-mono text-[11px] font-normal text-dim">{t.year}</span>
      </p>
      {mark && <Stars value={mark.rating} onChange={mark.rate} size={18} />}
      <button onClick={onClear} aria-label="Retirer" className="text-dim hover:text-bone">
        <X size={18} />
      </button>
    </motion.div>
  );
}

function TitlePicker({ onPick, onClose }: { onPick: (t: PosterData) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PosterData[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setItems([]);
    let stale = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { results: PosterData[] };
        if (!stale) setItems(data.results?.slice(0, 8) ?? []);
      } catch {
      } finally {
        if (!stale) setLoading(false);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
      <div className="mt-2 border border-line">
        <div className="flex items-center gap-3 border-b border-line px-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Chercher un titre"
            className="h-11 w-full bg-transparent outline-none placeholder:text-bone/30"
          />
          {loading && <Dots />}
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {items.map((t) => (
            <li key={`${t.kind}${t.tmdbId}`}>
              <button type="button" onClick={() => onPick(t)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-ink-2">
                <div className="h-12 w-8 shrink-0 overflow-hidden bg-ink-3">
                  {t.poster && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.poster} alt="" className="size-full object-cover" />
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="font-mono text-[11px] text-dim">{t.kind === "tv" ? "Série" : t.year}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

export function FollowButton({ handle, following }: { handle: string; following: boolean }) {
  const [on, setOn] = useState(following);
  const [, start] = useTransition();
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={() => {
        setOn(!on);
        start(() => setFollow(handle, !on));
      }}
      className={`flex h-11 items-center px-6 text-sm font-semibold transition-colors ${on ? "border border-line text-bone hover:border-coral hover:text-coral" : "notch bg-lime text-ink"}`}
    >
      {on ? "Abonné" : "Suivre"}
    </motion.button>
  );
}
