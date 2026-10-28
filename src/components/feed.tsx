"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BarChart3, CalendarClock, Clapperboard, Flag, Heart, ImageIcon, ListOrdered, MessageCircle, Mic, Plus, Repeat2, Rows3, Send, Trash2, X } from "lucide-react";
import { createPost, createRichPost, deletePost, setFollow, toggleFav, toggleRepost } from "@/app/feed/actions";
import { ReportSheet } from "./safety";
import { EmojiTool, GifTool, ImageTool, MediaStrip, MentionHint, PostMediaView, ScheduleChip, ScheduleTool } from "./composer-tools";
import { ClipView, FramePicker, PollBuilder, PollView, TIERS, Top5Builder, Top5View, TierBuilder, TierView, type PollDraft } from "./post-kinds";
import type { PostMedia, TierItem, TitleRef } from "@/db/schema";
import { StarShape, Stars, useMark } from "./marks";
import { Dots } from "./ui";
import { fmtRating } from "@/lib/rating";
import type { FeedPost } from "@/lib/feed";
import { useLocale, useT } from "./i18n";
import { Avatar } from "./avatar";
import { ShareToChat } from "./chat/share";
import { tag, type Locale, type T } from "@/lib/i18n";
import type { PosterData } from "./poster";

function ago(iso: string, t: T, locale: Locale) {
  const m = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (m < 1) return t("à l'instant");
  if (m < 60) return `${Math.floor(m)} min`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h`;
  if (m < 60 * 24 * 30) return t("{n} j", { n: Math.floor(m / 1440) });
  return new Date(iso).toLocaleDateString(tag(locale), { day: "2-digit", month: "short" });
}

/** Title block on top of a post: poster, name, year and the author's stars. */
function TitleBlock({ t, rating }: { t: NonNullable<FeedPost["title"]>; rating: number | null }) {
  const tr = useT();
  return (
    <Link href={`/t/${t.kind}/${t.tmdbId}`} className="inline-flex max-w-full items-center gap-2.5 border border-line bg-ink-2 py-1 pl-1 pr-3 transition-colors hover:border-lime">
      <div className="grid h-10 w-7 shrink-0 place-items-center overflow-hidden bg-ink-3 font-display text-sm font-extrabold text-bone/15">
        {t.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.poster} alt="" className="size-full object-cover" />
        ) : (
          t.name.charAt(0)
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold leading-tight">{t.name}</p>
        <p className="flex items-center gap-2.5 font-mono text-[10px] text-dim">
          {t.year}
          {t.kind === "tv" && <span className="uppercase">{tr("Série")}</span>}
          {rating ? (
            <span className="flex items-center gap-0.5" aria-label={tr("{n} sur 5", { n: fmtRating(rating) })}>
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
  const t = useT();
  const locale = useLocale();
  const [liked, setLiked] = useState(p.liked);
  const [reposted, setReposted] = useState(p.reposted);
  const [gone, setGone] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [sharing, setSharing] = useState(false);
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
        <Link href={`/u/${p.handle}`} className="shrink-0">
          <Avatar id={p.avatarId} handle={p.handle} size={36} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${p.handle}`} className="font-mono text-sm hover:text-lime">
            @{p.handle}
          </Link>
          {p.replyTo && <span className="ml-2 font-mono text-[11px] text-dim">↳ @{p.replyTo}</span>}
        </div>
        {p.scheduled ? (
          <span className="flex items-center gap-1 font-mono text-[11px] text-lime" title={t("Programmé")}>
            <CalendarClock size={12} /> {new Date(p.at).toLocaleString(tag(locale), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : (
          <Link href={`/p/${p.id}`} className="font-mono text-[11px] text-dim hover:text-bone">
            {ago(p.at, t, locale)}
          </Link>
        )}
      </header>

      {p.title && !p.replyTo && (p.kind === "text" || p.kind === "clip") && (
        <div className="mb-3">
          <TitleBlock t={p.title} rating={p.rating} />
        </div>
      )}

      <Link href={`/p/${p.id}`} className="block">
        {p.body ? (
          <p className={`whitespace-pre-line leading-relaxed ${big ? "text-lg md:text-xl" : ""}`}>
            {p.voice && <Mic size={14} className="mr-2 inline align-[-2px] text-lime" aria-label={t("Vocal")} />}
            {p.body}
          </p>
        ) : (
          p.voice && (
            <p className="flex items-center gap-2 font-mono text-xs text-dim">
              <Mic size={14} className="text-lime" /> {t("Vocal")}
            </p>
          )
        )}
      </Link>

      <PostMediaView media={p.media} />
      {p.kind === "clip" && p.clip && (
        <div className="mt-3">
          <ClipView clip={p.clip} />
        </div>
      )}
      {p.kind === "top5" && p.data && "items" in p.data && (
        <div className="mt-3">
          <Top5View data={p.data} />
        </div>
      )}
      {p.kind === "tier" && p.data && "tiers" in p.data && (
        <div className="mt-3">
          <TierView data={p.data} />
        </div>
      )}
      {p.kind === "poll" && p.data && "question" in p.data && (
        <div className="mt-3">
          <PollView p={p} />
        </div>
      )}

      <footer className="mt-4 flex items-center gap-8 text-dim">
        <Link href={`/p/${p.id}`} className="flex items-center gap-2 text-sm transition-colors hover:text-ice" aria-label={t("Répondre")}>
          <MessageCircle size={17} /> <span className="font-mono text-xs tabular-nums">{p.replies || ""}</span>
        </Link>
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => {
            setReposted(!reposted);
            start(() => toggleRepost(p.id, !reposted));
          }}
          aria-label={t("Reposter")}
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
          aria-label={t("Favori")}
          aria-pressed={liked}
          className={`flex items-center gap-2 text-sm transition-colors ${liked ? "text-coral" : "hover:text-coral"}`}
        >
          <motion.span key={String(liked)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 14 }}>
            <Heart size={17} fill={liked ? "currentColor" : "none"} />
          </motion.span>
          <span className="font-mono text-xs tabular-nums">{likes || ""}</span>
        </motion.button>
        <button onClick={() => setSharing(true)} aria-label={t("Envoyer en message")} title={t("Envoyer en message")} className="transition-colors hover:text-ice">
          <Send size={15} />
        </button>
        {!p.mine && (
          <button onClick={() => setReporting(true)} aria-label={t("Signaler")} title={t("Signaler")} className="ml-auto transition-colors hover:text-coral">
            <Flag size={14} />
          </button>
        )}
        {p.mine && (
          <button
            onClick={() => {
              setGone(true);
              start(async () => {
                await deletePost(p.id);
                if (big) router.push("/feed");
              });
            }}
            aria-label={t("Supprimer")}
            title={t("Supprimer")}
            className="ml-auto transition-colors hover:text-coral"
          >
            <Trash2 size={15} />
          </button>
        )}
      </footer>
      <AnimatePresence>{reporting && <ReportSheet target={{ type: "post", id: p.id, label: `@${p.handle}` }} onClose={() => setReporting(false)} />}</AnimatePresence>
      <AnimatePresence>{sharing && <ShareToChat postId={p.id} onClose={() => setSharing(false)} />}</AnimatePresence>
    </motion.article>
  );
}

/** Writes a post, optionally about a title (picked with the search) and with stars. With parentId, a reply. */
type Mode = "text" | "top5" | "tier" | "poll";
const emptyTier = () => ({ title: "", tiers: TIERS.map((label) => ({ label, items: [] as TierItem[] })) });
const emptyPoll = (): PollDraft => ({ question: "", options: [{ label: "" }, { label: "" }], answer: null, frameId: null, ref: null });

export function Composer({ parentId, placeholder, canCapture = false }: { parentId?: string; placeholder?: string; canCapture?: boolean }) {
  const router = useRouter();
  const t = useT();
  const [mode, setMode] = useState<Mode>("text");
  const [media, setMedia] = useState<PostMedia[]>([]);
  const [publishAt, setPublishAt] = useState<string | null>(null);
  const [frames, setFrames] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  const [top5, setTop5] = useState<{ title: string; items: TitleRef[] }>({ title: "", items: [] });
  const [tier, setTier] = useState(emptyTier);
  const [poll, setPoll] = useState<PollDraft>(emptyPoll);
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

  // Every new post is about a film or a series: no title yet, ask for one first
  const needsTitle = !parentId && ((mode === "text" && !title && !media.some((m) => m.type === "frame")) || (mode === "poll" && !poll.ref && !poll.frameId));
  const send = () =>
    start(async () => {
      setError(null);
      if (needsTitle) {
        setError(t("De quel film ou série tu parles ?"));
        if (mode === "text") setPicking(true);
        return;
      }
      const res =
        mode === "top5"
          ? await createRichPost({ kind: "top5", body, data: top5 })
          : mode === "tier"
            ? await createRichPost({ kind: "tier", body, data: tier })
            : mode === "poll"
              ? await createRichPost({ kind: "poll", body, data: { ...poll, options: poll.options.filter((o) => o.label.trim()) } })
              : await createPost({ body, parentId, kind: title?.kind as "movie" | "tv" | undefined, tmdbId: title?.tmdbId, media, publishAt: publishAt ?? undefined });
      if (!res.ok) return setError(t(res.error ?? "Oups"));
      setBody("");
      setTitle(null);
      setMedia([]);
      setPublishAt(null);
      setTop5({ title: "", items: [] });
      setTier(emptyTier());
      setPoll(emptyPoll());
      setMode("text");
      router.refresh();
    });
  const ready =
    mode === "text"
      ? Boolean(body.trim() || media.length)
      : mode === "top5"
        ? Boolean(top5.title.trim() && top5.items.length)
        : mode === "tier"
          ? Boolean(tier.title.trim() && tier.tiers.some((x) => x.items.length))
          : Boolean(poll.question.trim() && poll.options.filter((o) => o.label.trim()).length >= 2);
  const insert = (text: string) => {
    const el = area.current;
    const at = el?.selectionStart ?? body.length;
    setBody(body.slice(0, at) + text + body.slice(el?.selectionEnd ?? at));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + text.length, at + text.length);
    });
  };
  const addMedia = (m: PostMedia) => setMedia((x) => (x.length >= 4 ? x : [...x, m]));
  const tools: { m: Mode; label: string; icon: React.ReactNode }[] = [
    { m: "top5", label: "Top 5", icon: <ListOrdered size={16} /> },
    { m: "tier", label: "Tier list", icon: <Rows3 size={16} /> },
    { m: "poll", label: "Sondage", icon: <BarChart3 size={16} /> },
  ];

  return (
    <div className="border-b border-line px-4 py-5 md:px-6">
      {mode === "top5" && <Top5Builder value={top5} onChange={setTop5} Picker={TitlePicker} />}
      {mode === "tier" && <TierBuilder value={tier} onChange={setTier} Picker={TitlePicker} frames={canCapture} />}
      {mode === "poll" && <PollBuilder value={poll} onChange={setPoll} Picker={TitlePicker} frames={canCapture} />}
      {mode === "text" && title && <PickedTitle t={title} onClear={() => setTitle(null)} />}
      <textarea
        ref={area}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder={mode === "text" ? (placeholder ?? t("Un film, une série : ton avis, ta théorie, ta reco")) : t("Un mot pour accompagner (facultatif)")}
        className="w-full resize-none bg-transparent text-lg outline-none placeholder:text-bone/30"
      />
      {!parentId && (
        <MentionHint
          text={body}
          active={mode === "text" && !title && !picking}
          onAccept={(r) => setTitle({ ...r, ready: false })}
        />
      )}
      {mode === "text" && <MediaStrip media={media} onRemove={(i) => setMedia((x) => x.filter((_, j) => j !== i))} />}
      <AnimatePresence>{frames && <FramePicker onPick={(f) => (addMedia({ type: "frame", clipId: f.id }), setFrames(false))} onClose={() => setFrames(false)} />}</AnimatePresence>
      <AnimatePresence>{mode === "text" && picking && <TitlePicker onPick={(t) => (setTitle(t), setPicking(false))} onClose={() => setPicking(false)} />}</AnimatePresence>
      {error && <p className="mt-2 text-sm text-coral">{error}</p>}
      <div className="mt-3 flex items-center justify-between gap-4">
        {!parentId ? (
          <div className="relative flex min-w-0 items-center gap-2" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenu(!menu)}
              aria-label={t("Ajouter")}
              aria-expanded={menu}
              title={t("Ajouter")}
              className={`grid size-10 shrink-0 place-items-center border transition-colors ${menu ? "border-lime text-lime" : "border-line text-bone/70 hover:border-bone/40 hover:text-bone"}`}
            >
              <motion.span animate={{ rotate: menu ? 45 : 0 }} className="grid">
                <Plus size={18} />
              </motion.span>
            </button>
            {mode === "text" && (
              <>
                <ImageTool onAdd={addMedia} disabled={media.length >= 4} />
                <GifTool onPick={addMedia} disabled={media.length >= 4} />
                <EmojiTool onPick={insert} />
                <ScheduleTool value={publishAt} onChange={setPublishAt} />
                {publishAt && <ScheduleChip value={publishAt} onClear={() => setPublishAt(null)} />}
              </>
            )}
            {/* What is attached right now, removable in one tap */}
            {mode !== "text" && (
              <span className="flex h-10 min-w-0 items-center gap-2 border border-lime px-3 text-sm text-lime">
                {tools.find((x) => x.m === mode)?.icon}
                <span className="truncate">{t(tools.find((x) => x.m === mode)?.label ?? "")}</span>
                <button
                  type="button"
                  onClick={() => setMode("text")}
                  aria-label={t("Retirer")}
                  className="text-lime/70 hover:text-lime"
                >
                  <X size={14} />
                </button>
              </span>
            )}
            <AnimatePresence>
              {menu && (
                <motion.ul
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-12 z-30 w-56 border-l-2 border-lime bg-ink-2 py-1 shadow-2xl shadow-black/60"
                >
                  {[{ m: "title" as const, label: "Film ou série", icon: <Clapperboard size={16} /> }, ...(canCapture ? [{ m: "frame" as const, label: "Mes captures", icon: <ImageIcon size={16} /> }] : []), ...tools].map((x, i) => (
                    <motion.li key={x.m} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(false);
                          if (x.m === "title") {
                            setMode("text");
                            setPicking(true);
                          } else if (x.m === "frame") {
                            setMode("text");
                            setFrames(true);
                          } else {
                            setMode(x.m);
                            setPicking(false);
                          }
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-bone/5 hover:text-lime"
                      >
                        <span className="text-dim">{x.icon}</span>
                        {t(x.label)}
                      </button>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-4">
          {body.length > 800 && <span className="font-mono text-xs text-dim">{1000 - body.length}</span>}
          <button onClick={send} disabled={!ready || pending} className="notch flex h-10 min-w-24 shrink-0 items-center justify-center bg-lime px-5 text-sm font-semibold text-ink disabled:opacity-40">
            {pending ? <Dots /> : t(parentId ? "Répondre" : "Publier")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickedTitle({ t, onClear }: { t: PosterData; onClear: () => void }) {
  const mark = useMark(t);
  const tr = useT();
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
      <button onClick={onClear} aria-label={tr("Retirer")} className="text-dim hover:text-bone">
        <X size={18} />
      </button>
    </motion.div>
  );
}

export function TitlePicker({ onPick, onClose }: { onPick: (t: PosterData) => void; onClose: () => void }) {
  const tr = useT();
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
            placeholder={tr("Chercher un titre")}
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
                <span className="font-mono text-[11px] text-dim">{t.kind === "tv" ? tr("Série") : t.year}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

export function FollowButton({ handle, following }: { handle: string; following: boolean }) {
  const t = useT();
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
      {t(on ? "Abonné" : "Suivre")}
    </motion.button>
  );
}
