"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Flag, ImagePlus, KeyRound, Lock, Send, ShieldCheck } from "lucide-react";
import { open, openBytes, seal, sealBytes, threadKey } from "@/lib/e2e";
import { Avatar } from "../avatar";
import { EmojiTool, GifTool } from "../composer-tools";
import { PostCard } from "../feed";
import { useLocale, useT } from "../i18n";
import { ReportSheet } from "../safety";
import { Dots } from "../ui";
import { useChatKey } from "./keys";
import type { Msg, Payload, Thread } from "./message";
import type { FeedPost } from "@/lib/feed";

export function ChatApp({ to }: { to: string | null }) {
  const t = useT();
  const { state, setup, unlock } = useChatKey();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    const d = (await fetch("/api/chat/threads").then((r) => r.json())) as { threads: Thread[] };
    setThreads(d.threads);
    return d.threads;
  }, []);

  const openWith = useCallback(
    async (h: string) => {
      setError(null);
      const res = await fetch("/api/chat/threads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: h.replace(/^@/, "") }) });
      const d = (await res.json()) as { id?: string; error?: string };
      if (!d.id) return setError(t(d.error ?? "Introuvable"));
      await loadThreads();
      setActive(d.id);
      setHandle("");
    },
    [loadThreads, t],
  );

  useEffect(() => {
    if (state.status !== "ready") return;
    void loadThreads();
    const h = setInterval(() => void loadThreads(), 15_000);
    return () => clearInterval(h);
  }, [state.status, loadThreads]);
  useEffect(() => {
    if (state.status === "ready" && to) void openWith(to);
  }, [state.status, to, openWith]);

  if (state.status === "loading") return <div className="grid min-h-[60vh] place-items-center"><Dots /></div>;
  if (state.status === "setup") return <KeyGate mode="setup" onCode={(c) => setup(c)} />;
  if (state.status === "locked") return <KeyGate mode="unlock" onCode={unlock} onReset={(c) => setup(c, true)} />;

  const current = threads.find((x) => x.id === active) ?? null;
  return (
    <div className="grid h-[calc(100dvh-7.25rem)] md:h-[calc(100dvh-3rem)] md:grid-cols-[20rem_1fr]">
      <aside className={`flex min-h-0 flex-col border-line md:border-r ${current ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-line p-4">
          <h1 className="mb-3 flex items-center gap-2 font-display text-2xl font-extrabold">
            {t("Messages")} <ShieldCheck size={16} className="text-lime" aria-label={t("Chiffré de bout en bout")} />
          </h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (handle.trim()) void openWith(handle.trim());
            }}
            className="flex items-center gap-2 border border-line px-3 focus-within:border-lime"
          >
            <span className="text-dim">@</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={t("pseudo")} className="h-10 w-full bg-transparent text-sm outline-none" />
            <button aria-label={t("Écrire")} className="text-dim hover:text-lime">
              <Send size={15} />
            </button>
          </form>
          {error && <p className="mt-2 text-xs text-coral">{error}</p>}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {threads.map((th) => (
            <li key={th.id}>
              <button onClick={() => setActive(th.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bone/5 ${active === th.id ? "bg-bone/5" : ""}`}>
                <Avatar id={th.other.avatarId} handle={th.other.handle} size={38} />
                <span className="min-w-0 flex-1 truncate font-mono text-sm">@{th.other.handle}</span>
                {th.unread && <span className="size-2 bg-lime" />}
              </button>
            </li>
          ))}
          {!threads.length && <li className="p-6 text-sm text-dim">{t("Aucune conversation.")}</li>}
        </ul>
      </aside>
      {current ? (
        <ThreadView key={current.id} thread={current} myKey={state.key} onBack={() => setActive(null)} />
      ) : (
        <div className="hidden place-items-center md:grid">
          <p className="flex items-center gap-2 text-sm text-dim">
            <Lock size={14} /> {t("Seuls toi et ton interlocuteur pouvez lire vos messages.")}
          </p>
        </div>
      )}
    </div>
  );
}

function KeyGate({ mode, onCode, onReset }: { mode: "setup" | "unlock"; onCode: (c: string) => Promise<void>; onReset?: (c: string) => Promise<void> }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const creating = mode === "setup" || resetting;
  const go = async () => {
    setError(null);
    if (code.length < 6) return setError(t("6 caractères minimum"));
    if (creating && code !== again) return setError(t("Les deux codes ne correspondent pas"));
    setBusy(true);
    try {
      if (resetting && onReset) await onReset(code);
      else await onCode(code);
    } catch {
      setError(t(mode === "unlock" && !resetting ? "Code incorrect" : "Oups. Réessaie."));
    }
    setBusy(false);
  };
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <span className="mb-6 grid size-14 place-items-center bg-lime text-ink">
        <KeyRound size={24} />
      </span>
      <h1 className="font-display text-3xl font-extrabold">{t(creating ? "Ton code secret" : "Déverrouille tes messages")}</h1>
      <p className="mt-3 text-bone/80">
        {t(
          creating
            ? "Il chiffre tes messages sur cet appareil. Personne d'autre ne le connaît, pas même l'équipe : s'il est perdu, les anciens messages le sont aussi."
            : "Entre ton code secret pour lire tes messages sur cet appareil.",
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
        className="mt-8 space-y-4"
      >
        <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus placeholder={t("Code secret")} autoComplete={creating ? "new-password" : "current-password"} className="h-12 w-full border border-line bg-transparent px-4 outline-none focus:border-lime" />
        {creating && <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} placeholder={t("Encore une fois")} autoComplete="new-password" className="h-12 w-full border border-line bg-transparent px-4 outline-none focus:border-lime" />}
        {error && <p className="text-sm text-coral">{error}</p>}
        <button disabled={busy} className="notch flex h-12 w-full items-center justify-center bg-lime font-semibold text-ink disabled:opacity-40">
          {busy ? <Dots /> : t(creating ? "Créer" : "Déverrouiller")}
        </button>
      </form>
      {mode === "unlock" && !resetting && (
        <button onClick={() => setResetting(true)} className="mt-6 text-sm text-dim hover:text-coral">
          {t("Code oublié ? Repartir de zéro")}
        </button>
      )}
    </div>
  );
}

function ThreadView({ thread, myKey, onBack }: { thread: Thread; myKey: CryptoKey; onBack: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [items, setItems] = useState<(Msg & { p: Payload | null })[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<(Msg & { p: Payload | null }) | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const last = useRef<string | null>(null);

  const decrypt = useCallback(async (ms: Msg[]) => {
    const k = keyRef.current!;
    return Promise.all(ms.map(async (m) => ({ ...m, p: await open<Payload>(k, m.iv, m.body) })));
  }, []);

  useEffect(() => {
    if (!thread.other.publicKey) return;
    let stop = false;
    void (async () => {
      keyRef.current = await threadKey(myKey, thread.other.publicKey!, thread.id);
      const d = (await fetch(`/api/chat/threads/${thread.id}/messages`).then((r) => r.json())) as { messages: Msg[] };
      if (stop) return;
      const dm = await decrypt(d.messages);
      setItems(dm);
      last.current = dm.at(-1)?.at ?? null;
    })();
    const h = setInterval(async () => {
      if (!keyRef.current) return;
      const q = last.current ? `?after=${encodeURIComponent(last.current)}` : "";
      const d = (await fetch(`/api/chat/threads/${thread.id}/messages${q}`).then((r) => r.json()).catch(() => ({ messages: [] }))) as { messages: Msg[] };
      if (stop || !d.messages.length) return;
      const dm = await decrypt(d.messages);
      last.current = dm.at(-1)!.at;
      setItems((x) => [...x, ...dm.filter((m) => !x.some((y) => y.id === m.id))]);
    }, 3000);
    return () => {
      stop = true;
      clearInterval(h);
    };
  }, [thread, myKey, decrypt]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [items.length]);

  const send = async (p: Payload) => {
    if (!keyRef.current) return;
    setBusy(true);
    const sealed = await seal(keyRef.current, p);
    const res = await fetch(`/api/chat/threads/${thread.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sealed) });
    setBusy(false);
    if (!res.ok) return;
    const m = (await res.json()) as Msg;
    last.current = m.at;
    setItems((x) => [...x, { ...m, p }]);
  };

  const sendImage = async (f: File) => {
    if (!keyRef.current || f.size > 10 * 1024 * 1024) return;
    setBusy(true);
    const { iv, data } = await sealBytes(keyRef.current, await f.arrayBuffer());
    const res = await fetch(`/api/chat/files?thread=${thread.id}`, { method: "POST", body: data });
    const d = (await res.json().catch(() => ({}))) as { id?: string };
    setBusy(false);
    if (d.id) await send({ img: { id: d.id, iv, mime: f.type || "image/jpeg" } });
  };

  if (!thread.other.publicKey)
    return (
      <div className="grid place-items-center p-8 text-center text-sm text-dim">
        {t("@{h} n'a pas encore activé la messagerie.", { h: thread.other.handle })}
      </div>
    );

  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button onClick={onBack} aria-label={t("Retour")} className="text-dim hover:text-bone md:hidden">
          <ArrowLeft size={18} />
        </button>
        <Link href={`/u/${thread.other.handle}`} className="flex items-center gap-3 hover:text-lime">
          <Avatar id={thread.other.avatarId} handle={thread.other.handle} size={32} />
          <span className="font-mono text-sm">@{thread.other.handle}</span>
        </Link>
        <ShieldCheck size={14} className="ml-auto text-lime" aria-label={t("Chiffré de bout en bout")} />
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {items.map((m) => (
          <div key={m.id} className={`group flex items-end gap-2 ${m.mine ? "justify-end" : ""}`}>
            {!m.mine && (
              <button onClick={() => setReporting(m)} aria-label={t("Signaler")} className="order-last text-dim opacity-0 transition-opacity hover:text-coral group-hover:opacity-100">
                <Flag size={12} />
              </button>
            )}
            <div className={`max-w-[80%] ${m.mine ? "bg-lime/90 text-ink" : "bg-ink-2"} px-3 py-2`}>
              <Bubble p={m.p} k={keyRef.current} />
              <p className={`mt-1 text-right font-mono text-[9px] ${m.mine ? "text-ink/60" : "text-dim"}`}>
                {new Date(m.at).toLocaleTimeString(locale === "en" ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void send({ t: text.trim() });
          setText("");
        }}
        className="flex items-center gap-1 border-t border-line px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <button type="button" onClick={() => fileInput.current?.click()} aria-label={t("Image")} className="grid size-9 place-items-center text-dim hover:text-lime">
          <ImagePlus size={18} />
        </button>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void sendImage(e.target.files[0])} />
        <GifTool onPick={(m) => m.type === "gif" && void send({ gif: m })} />
        <EmojiTool onPick={(e) => setText((x) => x + e)} />
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder={t("Message")} className="h-10 min-w-0 flex-1 bg-transparent px-2 outline-none" />
        <button disabled={busy || !text.trim()} aria-label={t("Envoyer")} className="grid size-10 place-items-center bg-lime text-ink disabled:opacity-40">
          {busy ? <Dots /> : <Send size={16} />}
        </button>
      </form>
      <AnimatePresence>
        {reporting && <ReportSheet target={{ type: "message", id: reporting.id, label: `@${thread.other.handle}`, text: reporting.p?.t ?? "" }} onClose={() => setReporting(null)} />}
      </AnimatePresence>
    </section>
  );
}

function Bubble({ p, k }: { p: Payload | null; k: CryptoKey | null }) {
  const t = useT();
  if (!p) return <p className="text-xs italic opacity-60">{t("Message illisible")}</p>;
  return (
    <div className="space-y-2">
      {p.t && <p className="whitespace-pre-line break-words">{p.t}</p>}
      {p.gif && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.gif.url} alt="" className="max-h-60" />
      )}
      {p.img && k && <SecretImage file={p.img} k={k} />}
      {p.post && <SharedPost id={p.post} />}
    </div>
  );
}

/** Downloads the encrypted bytes and decrypts them in the browser. */
function SecretImage({ file, k }: { file: { id: string; iv: string; mime: string }; k: CryptoKey }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    void (async () => {
      const data = await fetch(`/api/chat/files/${file.id}`).then((r) => r.arrayBuffer());
      const plain = await openBytes(k, file.iv, data);
      u = URL.createObjectURL(new Blob([plain], { type: file.mime }));
      setUrl(u);
    })().catch(() => {});
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [file, k]);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="max-h-72" />
  ) : (
    <Dots />
  );
}

function SharedPost({ id }: { id: string }) {
  const [post, setPost] = useState<FeedPost | null>(null);
  useEffect(() => {
    fetch(`/api/posts/${id}`)
      .then((r) => r.json() as Promise<{ post: FeedPost | null }>)
      .then((d) => setPost(d.post))
      .catch(() => {});
  }, [id]);
  if (!post) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-sm border border-line bg-ink text-bone [&_article]:border-0 [&_article]:px-3 [&_article]:py-3">
      <PostCard p={post} />
    </motion.div>
  );
}
