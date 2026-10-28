"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BarChart3, Clapperboard, ImagePlus, ListOrdered, Plus, Rows3, Send, X } from "lucide-react";
import { EmojiTool, GifTool } from "../composer-tools";
import { TitlePicker } from "../feed";
import { useT } from "../i18n";
import { PollBuilder, TIERS, Thumb, Top5Builder, TierBuilder, toRef, type PollDraft } from "../post-kinds";
import { Dots } from "../ui";
import type { PostMedia, TierItem, TitleRef } from "@/db/schema";
import type { Payload, Rich } from "./message";

type Staged = { type: "file"; file: File; preview: string } | Extract<PostMedia, { type: "gif" }>;
type Mode = "text" | "top5" | "tier" | "poll";

const emptyTier = () => ({ title: "", tiers: TIERS.map((label) => ({ label, items: [] as TierItem[] })) });
const emptyPoll = (): PollDraft => ({ question: "", options: [{ label: "" }, { label: "" }], answer: null, frameId: null, ref: null });
const MAX = 4;

/**
 * Chat composer: text, pictures, GIFs, a film or series, a top 5, a tier list or a poll,
 * all gathered first and sent together. Pictures are encrypted only when the message leaves.
 */
export function ChatComposer({ busy, disabled, onSend }: { busy: boolean; disabled?: boolean; onSend: (p: Omit<Payload, "media">, files: Staged[]) => Promise<boolean> }) {
  const t = useT();
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [title, setTitle] = useState<TitleRef | null>(null);
  const [mode, setMode] = useState<Mode>("text");
  const [top5, setTop5] = useState<{ title: string; items: TitleRef[] }>({ title: "", items: [] });
  const [tier, setTier] = useState(emptyTier);
  const [poll, setPoll] = useState<PollDraft>(emptyPoll);
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  const rich: Rich | null =
    mode === "top5" && top5.title.trim() && top5.items.length
      ? { kind: "top5", data: top5 }
      : mode === "tier" && tier.title.trim() && tier.tiers.some((x) => x.items.length)
        ? { kind: "tier", data: tier }
        : mode === "poll" && poll.question.trim() && poll.options.filter((o) => o.label.trim()).length >= 2
          ? { kind: "poll", data: { ...poll, options: poll.options.filter((o) => o.label.trim()) } }
          : null;
  const ready = !disabled && !busy && (mode === "text" ? Boolean(text.trim() || staged.length || title) : Boolean(rich));

  const reset = () => {
    setText("");
    staged.forEach((s) => s.type === "file" && URL.revokeObjectURL(s.preview));
    setStaged([]);
    setTitle(null);
    setMode("text");
    setTop5({ title: "", items: [] });
    setTier(emptyTier());
    setPoll(emptyPoll());
  };

  const send = async () => {
    if (!ready) return;
    const p: Omit<Payload, "media"> = { ...(text.trim() ? { t: text.trim() } : {}), ...(title && mode === "text" ? { title } : {}), ...(rich ? { rich } : {}) };
    if (await onSend(p, mode === "text" ? staged : [])) reset();
  };

  const tools: { m: Mode | "title"; label: string; icon: React.ReactNode }[] = [
    { m: "title", label: "Film ou série", icon: <Clapperboard size={16} /> },
    { m: "top5", label: "Top 5", icon: <ListOrdered size={16} /> },
    { m: "tier", label: "Tier list", icon: <Rows3 size={16} /> },
    { m: "poll", label: "Sondage", icon: <BarChart3 size={16} /> },
  ];

  return (
    <div className="border-t border-line">
      {/* Everything gathered so far, above the input */}
      {mode !== "text" && (
        <div className="max-h-[50dvh] overflow-y-auto px-3 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-lime">
              {tools.find((x) => x.m === mode)?.icon} {t(tools.find((x) => x.m === mode)?.label ?? "")}
            </span>
            <button type="button" onClick={() => setMode("text")} aria-label={t("Retirer")} className="grid size-8 place-items-center text-dim hover:text-coral">
              <X size={15} />
            </button>
          </div>
          {mode === "top5" && <Top5Builder value={top5} onChange={setTop5} Picker={TitlePicker} />}
          {mode === "tier" && <TierBuilder value={tier} onChange={setTier} Picker={TitlePicker} frames={false} />}
          {mode === "poll" && <PollBuilder value={poll} onChange={setPoll} Picker={TitlePicker} frames={false} />}
        </div>
      )}
      {mode === "text" && (title || staged.length > 0) && (
        <div className="flex flex-wrap items-end gap-2 px-3 pt-3">
          {title && (
            <span className="relative">
              <Thumb item={{ type: "title", ...title }} size="sm" />
              <RemoveBtn onClick={() => setTitle(null)} />
            </span>
          )}
          {staged.map((s, i) => (
            <span key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.type === "file" ? s.preview : s.url} alt="" className="h-14 w-auto max-w-28 object-cover" />
              <RemoveBtn
                onClick={() => {
                  if (s.type === "file") URL.revokeObjectURL(s.preview);
                  setStaged((x) => x.filter((_, j) => j !== i));
                }}
              />
            </span>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-1 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu(!menu)}
            aria-label={t("Ajouter")}
            title={t("Ajouter")}
            aria-expanded={menu}
            className={`grid size-9 place-items-center border transition-colors ${menu ? "border-lime text-lime" : "border-line text-dim hover:text-bone"}`}
          >
            <motion.span animate={{ rotate: menu ? 45 : 0 }} className="grid">
              <Plus size={17} />
            </motion.span>
          </button>
          <AnimatePresence>
            {menu && (
              <motion.ul
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-11 left-0 z-30 w-52 border-l-2 border-lime bg-ink-2 py-1 shadow-2xl shadow-black/60"
              >
                {tools.map((x) => (
                  <li key={x.m}>
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(false);
                        if (x.m === "title") {
                          setMode("text");
                          setPicking(true);
                        } else setMode(x.m);
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-bone/5 ${mode === x.m ? "text-lime" : "text-bone"}`}
                    >
                      {x.icon} {t(x.label)}
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
        {mode === "text" && (
          <>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={staged.length >= MAX} aria-label={t("Image")} title={t("Image")} className="grid size-9 place-items-center text-dim hover:text-lime disabled:opacity-30">
              <ImagePlus size={18} />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])].filter((f) => f.size <= 10 * 1024 * 1024);
                setStaged((x) => [...x, ...files.map((file) => ({ type: "file" as const, file, preview: URL.createObjectURL(file) }))].slice(0, MAX));
                e.target.value = "";
              }}
            />
            <GifTool up disabled={staged.length >= MAX} onPick={(m) => m.type === "gif" && setStaged((x) => [...x, m].slice(0, MAX))} />
          </>
        )}
        <EmojiTool up onPick={(e) => setText((x) => x + e)} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          placeholder={t(mode === "text" ? "Message" : "Un mot pour accompagner (facultatif)")}
          className="h-10 min-w-0 flex-1 bg-transparent px-2 outline-none"
        />
        <button disabled={!ready} aria-label={t("Envoyer")} className="grid size-10 shrink-0 place-items-center bg-lime text-ink disabled:opacity-40">
          {busy ? <Dots /> : <Send size={16} />}
        </button>
      </form>
      <AnimatePresence>
        {picking && (
          <TitlePicker
            onPick={(p) => {
              setTitle(toRef(p));
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} aria-label={t("Retirer")} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center bg-ink text-bone ring-1 ring-line hover:text-coral">
      <X size={11} />
    </button>
  );
}

export type { Staged };
