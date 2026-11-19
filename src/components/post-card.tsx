"use client";
import { splitTags } from "@/lib/hashtags";
import { kindLabel, type Kind } from "@/lib/kinds";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, Flag, Heart, MessageCircle, Mic, Repeat2, Send, Trash2 } from "lucide-react";
import { deletePost, toggleFav, toggleRepost } from "@/app/feed/actions";
import { ReportSheet } from "./safety";
import { PostMediaView } from "./composer-tools";
import { ClipView, PollView, Top5View, TierView } from "./post-kinds";
import { StarShape } from "./marks";
import { fmtRating } from "@/lib/rating";
import type { FeedPost } from "@/lib/feed";
import { useLocale, useT } from "./i18n";
import { Avatar } from "./avatar";
import { ShareToChat } from "./chat/share";
import { tag, type Locale, type T } from "@/lib/i18n";

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
      <div className={`grid h-10 ${t.kind === "album" ? "w-10" : "w-7"} shrink-0 place-items-center overflow-hidden bg-ink-3 font-display text-sm font-extrabold text-bone/15`}>
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
          {t.kind !== "movie" && <span className="uppercase">{tr(kindLabel[t.kind as Kind] ?? "")}</span>}
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
  const [confirmDelete, setConfirmDelete] = useState(false);
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
        <Link href={`/u/${p.handle}`} aria-label={`@${p.handle}`} className="shrink-0">
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

      {p.body ? (
        // The text opens the post (its date stays the keyboard link), its hashtags open their feed
        <p
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest("a") && !window.getSelection()?.toString()) router.push(`/p/${p.id}`);
          }}
          className={`cursor-pointer whitespace-pre-line break-words leading-relaxed ${big ? "text-lg md:text-xl" : ""}`}
        >
          {p.voice && <Mic size={14} className="mr-2 inline align-[-2px] text-lime" aria-label={t("Vocal")} />}
          {splitTags(p.body).map((x, i) =>
            "tag" in x ? (
              <Link key={i} href={`/feed?tag=${encodeURIComponent(x.tag)}`} className="text-lime hover:underline">
                {x.raw}
              </Link>
            ) : (
              <Fragment key={i}>{x.text}</Fragment>
            ),
          )}
        </p>
      ) : (
        p.voice && (
          <Link href={`/p/${p.id}`} className="block">
            <p className="flex items-center gap-2 font-mono text-xs text-dim">
              <Mic size={14} className="text-lime" /> {t("Vocal")}
            </p>
          </Link>
        )
      )}

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
        {p.mine &&
          (confirmDelete ? (
            // Second tap deletes: one stray tap on the bin no longer loses a post
            <button
              autoFocus
              onBlur={() => setConfirmDelete(false)}
              onClick={() => {
                setGone(true);
                start(async () => {
                  await deletePost(p.id);
                  if (big) router.push("/feed");
                });
              }}
              className="ml-auto flex items-center gap-1.5 bg-coral px-2 py-1 text-xs font-semibold text-ink"
            >
              <Trash2 size={13} /> {t("Supprimer")}
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(true)} aria-label={t("Supprimer")} title={t("Supprimer")} className="ml-auto transition-colors hover:text-coral">
              <Trash2 size={15} />
            </button>
          ))}
      </footer>
      <AnimatePresence>{reporting && <ReportSheet target={{ type: "post", id: p.id, label: `@${p.handle}` }} onClose={() => setReporting(false)} />}</AnimatePresence>
      <AnimatePresence>{sharing && <ShareToChat postId={p.id} onClose={() => setSharing(false)} />}</AnimatePresence>
    </motion.article>
  );
}
