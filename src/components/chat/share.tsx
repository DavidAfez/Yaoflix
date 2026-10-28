"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import { seal, threadKey } from "@/lib/e2e";
import { Avatar } from "../avatar";
import { useT } from "../i18n";
import { Dots } from "../ui";
import { useChatKey } from "./keys";
import type { Thread } from "./message";

/** Send a post into one of the member's conversations, encrypted like any message. */
export function ShareToChat({ postId, onClose }: { postId: string; onClose: () => void }) {
  const t = useT();
  const { state } = useChatKey();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/chat/threads")
      .then((r) => r.json() as Promise<{ threads: Thread[] }>)
      .then((d) => setThreads(d.threads.filter((x) => x.other.publicKey)))
      .catch(() => setThreads([]));
  }, []);
  const send = async (th: Thread) => {
    if (state.status !== "ready" || !th.other.publicKey) return;
    const key = await threadKey(state.key, th.other.publicKey, th.id);
    const sealed = await seal(key, { post: postId });
    const res = await fetch(`/api/chat/threads/${th.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sealed) });
    if (res.ok) {
      setSent(th.id);
      setTimeout(onClose, 900);
    }
  };
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[90] bg-ink/70 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[95] max-h-[80dvh] overflow-y-auto border-t-2 border-ice bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 md:left-auto md:top-0 md:max-h-none md:w-[400px] md:border-l-2 md:border-t-0 md:pt-10"
      >
        <div className="mb-5 flex items-center justify-between">
          <p className="font-display text-xl font-semibold">{t("Envoyer en message")}</p>
          <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
            <X />
          </button>
        </div>
        {state.status === "loading" || !threads ? (
          <Dots />
        ) : state.status !== "ready" ? (
          <Link href="/chat" className="notch inline-flex h-11 items-center bg-lime px-5 text-sm font-semibold text-ink">
            {t("Ouvrir la messagerie")}
          </Link>
        ) : threads.length === 0 ? (
          <p className="text-sm text-dim">{t("Aucune conversation.")}</p>
        ) : (
          <ul className="space-y-1">
            {threads.map((th) => (
              <li key={th.id}>
                <button onClick={() => void send(th)} className="flex w-full items-center gap-3 px-2 py-2 text-left transition-colors hover:bg-bone/5">
                  <Avatar id={th.other.avatarId} handle={th.other.handle} size={32} />
                  <span className="flex-1 font-mono text-sm">@{th.other.handle}</span>
                  {sent === th.id && <Check size={16} className="text-lime" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </>
  );
}
