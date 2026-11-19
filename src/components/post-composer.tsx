"use client";
import { tagAtCaret } from "@/lib/hashtags";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BarChart3, Clapperboard, ImageIcon, ListOrdered, Plus, Rows3, X } from "lucide-react";
import { createPost, createRichPost } from "@/app/feed/actions";
import { EmojiTool, GifTool, ImageTool, MediaStrip, MentionHint, ScheduleChip, ScheduleTool } from "./composer-tools";
import { FramePicker, PollBuilder, TIERS, Top5Builder, TierBuilder, type PollDraft } from "./post-kinds";
import type { PostMedia, TierItem, TitleRef } from "@/db/schema";
import { Stars, useMark } from "./marks";
import { Dots } from "./ui";
import { useT } from "./i18n";
import type { PosterData } from "./poster";
import { TitlePicker } from "./title-picker";
import { progressed } from "./trophies";

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
  const [caret, setCaret] = useState(0);
  const [tagHints, setTagHints] = useState<string[]>([]);
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
  // Hashtag being typed: suggest the ones already in use
  const typingTag = tagAtCaret(body, caret);
  useEffect(() => {
    if (!typingTag) return setTagHints([]);
    let stale = false;
    const h = setTimeout(async () => {
      const r = (await fetch(`/api/tags?q=${encodeURIComponent(typingTag)}`).then((x) => x.json()).catch(() => ({ tags: [] }))) as { tags: string[] };
      if (!stale) setTagHints(r.tags ?? []);
    }, 200);
    return () => {
      stale = true;
      clearTimeout(h);
    };
  }, [typingTag]);
  const completeTag = (tag: string) => {
    if (typingTag === null) return;
    const start0 = caret - typingTag.length;
    const next = `${body.slice(0, start0)}${tag} ${body.slice(caret)}`;
    setBody(next);
    setTagHints([]);
    requestAnimationFrame(() => {
      const at = start0 + tag.length + 1;
      area.current?.focus();
      area.current?.setSelectionRange(at, at);
      setCaret(at);
    });
  };

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
              : await createPost({ body, parentId, kind: title?.kind as "movie" | "tv" | "album" | "book" | undefined, tmdbId: title?.tmdbId, media, publishAt: publishAt ?? undefined });
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
      progressed();
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
        onChange={(e) => {
          setBody(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        maxLength={1000}
        rows={2}
        placeholder={mode === "text" ? (placeholder ?? t("Un film, une série : ton avis, ta théorie, ta reco")) : t("Un mot pour accompagner (facultatif)")}
        className="w-full resize-none bg-transparent text-lg outline-none placeholder:text-bone/30"
      />
      {tagHints.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-label={t("Hashtags déjà utilisés")}>
          {tagHints.map((x) => (
            <button key={x} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => completeTag(x)} className="border border-line px-2 py-0.5 text-sm text-lime transition-colors hover:border-lime">
              #{x}
            </button>
          ))}
        </div>
      )}
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
