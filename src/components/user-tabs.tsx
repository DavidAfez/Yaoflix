"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PostCard } from "./feed";
import { useT } from "./i18n";
import type { FeedPost } from "@/lib/feed";

/** Profile tabs, Twitter style: posts, replies, reposts, media, then reviews and the film library. */
export function UserTabs({ lists, reviews, library, projects }: { lists: { posts: FeedPost[]; replies: FeedPost[]; reposts: FeedPost[]; media: FeedPost[] }; reviews: React.ReactNode; library: React.ReactNode; projects?: { node: React.ReactNode; n: number } }) {
  const t = useT();
  const tabs = [
    // A creator's own work comes first
    ...(projects ? [{ k: "projects", label: "Projets", n: projects.n } as const] : []),
    { k: "posts", label: "Bobines", n: lists.posts.length },
    { k: "replies", label: "Réponses", n: lists.replies.length },
    { k: "reposts", label: "Reposts", n: lists.reposts.length },
    { k: "media", label: "Médias", n: lists.media.length },
    { k: "reviews", label: "Avis", n: null },
    { k: "library", label: "Films", n: null },
  ] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]["k"]>(projects ? "projects" : "posts");
  const list = tab === "posts" || tab === "replies" || tab === "reposts" || tab === "media" ? lists[tab] : null;
  return (
    <>
      <nav className="scrollbar-none sticky top-11 z-20 mt-10 flex gap-8 overflow-x-auto border-b border-line bg-ink/90 px-4 backdrop-blur md:top-12 md:px-10">
        {tabs.map((x) => (
          <button key={x.k} onClick={() => setTab(x.k)} className={`relative shrink-0 py-4 text-sm ${tab === x.k ? "text-bone" : "text-dim hover:text-bone"}`}>
            {t(x.label)}
            {x.n ? <span className="ml-1.5 font-mono text-[11px] text-lime">{x.n}</span> : null}
            {tab === x.k && <motion.span layoutId="user-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />}
          </button>
        ))}
      </nav>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {list ? (
            list.length ? (
              <div className="max-w-2xl md:mx-10 md:border-x md:border-line">
                {list.map((p, i) => (
                  <PostCard key={p.id} p={p} i={i} />
                ))}
              </div>
            ) : (
              <p className="px-4 py-16 font-display text-3xl font-extrabold text-bone/15 md:px-10 md:text-5xl">{t("Rien ici pour l'instant.")}</p>
            )
          ) : tab === "projects" ? (
            projects?.node
          ) : tab === "reviews" ? (
            reviews
          ) : (
            library
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
