"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowLeft, Check, Flag, ImagePlus, Lock, MonitorSmartphone, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { fingerprint, open, openBytes, safetyNumber, seal, sealBytes, type Device, type Me } from "@/lib/e2e";
import { Avatar } from "../avatar";
import { EmojiTool, GifTool } from "../composer-tools";
import { PostCard } from "../feed";
import { useLocale, useT } from "../i18n";
import { ReportSheet } from "../safety";
import { Dots } from "../ui";
import { useChatDevice } from "./device";
import { acceptKey, peer, type Peer } from "./peers";
import type { Msg, Payload, Thread } from "./message";
import type { FeedPost } from "@/lib/feed";

export function ChatApp({ to }: { to: string | null }) {
  const t = useT();
  const { state, reset, approve, revoke } = useChatDevice();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState(false);

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

  const ready = state.status === "ready";
  useEffect(() => {
    if (!ready) return;
    void loadThreads();
    const h = setInterval(() => void loadThreads(), 15_000);
    return () => clearInterval(h);
  }, [ready, loadThreads]);
  useEffect(() => {
    if (ready && to) void openWith(to);
  }, [ready, to, openWith]);

  if (state.status === "loading" || state.status === "none") return <div className="grid min-h-[60vh] place-items-center"><Dots /></div>;
  if (state.status === "pending") return <PendingGate code={state.code} onReset={reset} />;

  const current = threads.find((x) => x.id === active) ?? null;
  return (
    <div className="grid h-[calc(100dvh-7.25rem)] md:h-[calc(100dvh-3rem)] md:grid-cols-[20rem_1fr]">
      <aside className={`flex min-h-0 flex-col border-line md:border-r ${current ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-line p-4">
          <h1 className="mb-3 flex items-center gap-2 font-display text-2xl font-extrabold">
            {t("Messages")} <ShieldCheck size={16} className="text-lime" aria-label={t("Chiffré de bout en bout")} />
            <button onClick={() => setDevices(true)} aria-label={t("Mes appareils")} title={t("Mes appareils")} className="ml-auto grid size-9 place-items-center text-dim hover:text-lime">
              <MonitorSmartphone size={17} />
            </button>
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
        {state.waiting.map((d) => (
          <Approval key={d.id} device={d} onApprove={(p) => approve(d, p)} onRefuse={() => revoke(d)} />
        ))}
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
        <ThreadView key={current.id} thread={current} me={state.me} mine={state.mine} myRoot={state.root} onBack={() => setActive(null)} />
      ) : (
        <div className="hidden place-items-center md:grid">
          <p className="flex items-center gap-2 text-sm text-dim">
            <Lock size={14} /> {t("Seuls toi et ton interlocuteur pouvez lire vos messages.")}
          </p>
        </div>
      )}
      <AnimatePresence>{devices && <DevicesSheet me={state.me} mine={state.mine} onRevoke={revoke} onClose={() => setDevices(false)} />}</AnimatePresence>
    </div>
  );
}

/** A new device of this member, shown on the trusted ones with the code to compare. */
function Approval({ device, onApprove, onRefuse }: { device: Device & { code: string }; onApprove: (progress: (n: number) => void) => Promise<void>; onRefuse: () => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState<number | null>(null);
  return (
    <div className="border-b border-line bg-lime/10 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <MonitorSmartphone size={15} className="text-lime" /> {t("Nouvel appareil : {label}", { label: device.label || "?" })}
      </p>
      <p className="mt-1 text-bone/80">{t("Autorise-le seulement si ce code est affiché dessus :")}</p>
      <p className="mt-2 font-mono text-2xl tracking-widest text-lime">{device.code}</p>
      {busy !== null ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-dim">
          <Dots /> {t("Envoi de l'historique chiffré… {n}", { n: busy })}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              setBusy(0);
              void onApprove(setBusy).finally(() => setBusy(null));
            }}
            aria-label={t("Autoriser")}
            title={t("Autoriser")}
            className="grid size-10 place-items-center bg-lime text-ink"
          >
            <Check size={18} />
          </button>
          <button onClick={() => void onRefuse()} aria-label={t("Refuser")} title={t("Refuser")} className="grid size-10 place-items-center border border-line hover:border-coral hover:text-coral">
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

/** A device that isn't trusted yet: it waits for another of the member's devices to let it in. */
function PendingGate({ code, onReset }: { code: string; onReset: () => Promise<void> }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <span className="mb-6 grid size-14 place-items-center bg-lime text-ink">
        <MonitorSmartphone size={24} />
      </span>
      <h1 className="font-display text-3xl font-extrabold">{t("Nouvel appareil")}</h1>
      <p className="mt-3 text-bone/80">{t("Ouvre Messages sur un appareil où tu es déjà connecté et autorise celui-ci. Vérifie que le code est le même :")}</p>
      <p className="mt-6 font-mono text-4xl tracking-widest text-lime">{code}</p>
      <p className="mt-6 flex items-center gap-2 text-xs text-dim">
        <Dots /> {t("En attente")}
      </p>
      {!confirm ? (
        <button onClick={() => setConfirm(true)} className="mt-10 text-sm text-dim hover:text-coral">
          {t("Je n'ai plus accès à mes autres appareils")}
        </button>
      ) : (
        <div className="mt-10 border-l-2 border-coral bg-ink-2 p-4 text-sm">
          <p>{t("Cet appareil devient ta clé principale. Tes autres appareils sont déconnectés et tes anciens messages ne seront pas lisibles ici.")}</p>
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onReset().finally(() => setBusy(false));
              }}
              className="notch h-10 bg-coral px-5 font-semibold text-ink disabled:opacity-40"
            >
              {busy ? <Dots /> : t("Continuer")}
            </button>
            <button onClick={() => setConfirm(false)} aria-label={t("Annuler")} className="grid size-10 place-items-center border border-line">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DevicesSheet({ me, mine, onRevoke, onClose }: { me: Me; mine: Device[]; onRevoke: (d: Device) => Promise<void>; onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[90] bg-ink/70 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[95] max-h-[80dvh] overflow-y-auto border-t-2 border-lime bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 md:left-auto md:top-0 md:max-h-none md:w-[400px] md:border-l-2 md:border-t-0 md:pt-10"
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="font-display text-xl font-semibold">{t("Mes appareils")}</p>
          <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
            <X />
          </button>
        </div>
        <p className="mb-5 text-sm text-dim">{t("Chaque appareil a sa propre clé, qui ne le quitte jamais.")}</p>
        <ul className="space-y-1">
          {mine.map((d) => (
            <li key={d.id} className="flex items-center gap-3 border-b border-line py-3">
              <MonitorSmartphone size={16} className={d.id === me.id ? "text-lime" : "text-dim"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{d.label || "?"}</span>
                <span className="font-mono text-[10px] text-dim">
                  {d.id === me.id ? t("Cet appareil") : new Date(d.createdAt).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR")}
                </span>
              </span>
              {d.id !== me.id && (
                <button onClick={() => void onRevoke(d)} aria-label={t("Retirer")} title={t("Retirer")} className="grid size-9 place-items-center text-dim hover:text-coral">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </motion.div>
    </>
  );
}

type Item = Msg & { p: Payload | null };

function ThreadView({ thread, me, mine, myRoot, onBack }: { thread: Thread; me: Me; mine: Device[]; myRoot: Device; onBack: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<Item | null>(null);
  const [other, setOther] = useState<Peer | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const [showSafety, setShowSafety] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const last = useRef<string | null>(null);

  const decrypt = useCallback((ms: Msg[]) => Promise.all(ms.map(async (m) => ({ ...m, p: m.key ? await open<Payload>(me, m.key.from, m.key.wrap, m.iv, m.body) : null }))), [me]);

  const refreshPeer = useCallback(async () => {
    const p = await peer(me.userId, thread.other.handle);
    setOther(p);
    if (p?.fp) setSafety(await safetyNumber(await fingerprint(myRoot), p.fp));
    return p;
  }, [me.userId, thread.other.handle, myRoot]);

  useEffect(() => {
    let stop = false;
    void refreshPeer();
    void (async () => {
      const d = (await fetch(`/api/chat/threads/${thread.id}/messages?device=${me.id}`).then((r) => r.json())) as { messages: Msg[] };
      if (stop || !d.messages) return;
      const dm = await decrypt(d.messages);
      setItems(dm);
      last.current = dm.at(-1)?.at ?? null;
    })();
    const h = setInterval(async () => {
      const q = last.current ? `&after=${encodeURIComponent(last.current)}` : "";
      const d = (await fetch(`/api/chat/threads/${thread.id}/messages?device=${me.id}${q}`).then((r) => r.json()).catch(() => ({ messages: [] }))) as { messages: Msg[] };
      if (stop || !d.messages?.length) return;
      const dm = await decrypt(d.messages);
      last.current = dm.at(-1)!.at;
      setItems((x) => [...x, ...dm.filter((m) => !x.some((y) => y.id === m.id))]);
    }, 3000);
    return () => {
      stop = true;
      clearInterval(h);
    };
  }, [thread.id, me.id, decrypt, refreshPeer]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [items.length]);

  const send = async (p: Payload) => {
    setBusy(true);
    try {
      // Fresh device list each time: a device added a minute ago gets the message too
      const o = await refreshPeer();
      if (!o?.devices.length || o.changed) return;
      const sealed = await seal(me, [...o.devices, ...mine], p);
      const res = await fetch(`/api/chat/threads/${thread.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: me.id, ...sealed }) });
      if (!res.ok) return;
      const m = (await res.json()) as Msg;
      last.current = m.at;
      setItems((x) => [...x, { ...m, p }]);
    } finally {
      setBusy(false);
    }
  };

  const sendImage = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) return;
    setBusy(true);
    const { k, iv, data } = await sealBytes(await f.arrayBuffer());
    const res = await fetch(`/api/chat/files?thread=${thread.id}`, { method: "POST", body: data });
    const d = (await res.json().catch(() => ({}))) as { id?: string };
    setBusy(false);
    if (d.id) await send({ img: { id: d.id, iv, k, mime: f.type || "image/jpeg" } });
  };

  if (other && !other.devices.length)
    return (
      <div className="grid place-items-center p-8 text-center text-sm text-dim">
        {t("@{h} n'a pas encore ouvert la messagerie.", { h: thread.other.handle })}
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
        <button onClick={() => setShowSafety(!showSafety)} aria-label={t("Code de sécurité")} title={t("Code de sécurité")} className={`ml-auto grid size-9 place-items-center ${showSafety ? "text-lime" : "text-dim hover:text-lime"}`}>
          <ShieldCheck size={16} />
        </button>
      </header>
      <AnimatePresence>
        {showSafety && safety && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-b border-line bg-ink-2">
            <div className="px-4 py-4 text-sm">
              <p className="font-mono text-lg tracking-widest text-lime">{safety}</p>
              <p className="mt-1 text-dim">{t("Comparez ce code en personne. S'il est identique des deux côtés, personne ne peut lire vos messages, même pas le site.")}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {other?.changed && (
        <div className="flex items-start gap-3 border-b border-coral/40 bg-coral/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-coral" />
          <p className="flex-1">{t("La clé de @{h} a changé. C'est normal s'il a perdu ses appareils, sinon vérifiez votre code de sécurité.", { h: thread.other.handle })}</p>
          <button
            onClick={() => void acceptKey(me.userId, other).then(refreshPeer)}
            aria-label={t("J'ai compris")}
            title={t("J'ai compris")}
            className="grid size-9 shrink-0 place-items-center bg-coral text-ink"
          >
            <Check size={16} />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {items.map((m) => (
          <div key={m.id} className={`group flex items-end gap-2 ${m.mine ? "justify-end" : ""}`}>
            {!m.mine && m.p && (
              <button onClick={() => setReporting(m)} aria-label={t("Signaler")} className="order-last text-dim opacity-0 transition-opacity hover:text-coral group-hover:opacity-100">
                <Flag size={12} />
              </button>
            )}
            <div className={`max-w-[80%] ${m.mine ? "bg-lime/90 text-ink" : "bg-ink-2"} px-3 py-2`}>
              <Bubble p={m.p} missing={!m.key} />
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
        <button disabled={busy || !text.trim() || other?.changed} aria-label={t("Envoyer")} className="grid size-10 place-items-center bg-lime text-ink disabled:opacity-40">
          {busy ? <Dots /> : <Send size={16} />}
        </button>
      </form>
      <AnimatePresence>
        {reporting && <ReportSheet target={{ type: "message", id: reporting.id, label: `@${thread.other.handle}`, text: reporting.p?.t ?? "" }} onClose={() => setReporting(null)} />}
      </AnimatePresence>
    </section>
  );
}

function Bubble({ p, missing }: { p: Payload | null; missing: boolean }) {
  const t = useT();
  if (!p) return <p className="text-xs italic opacity-60">{t(missing ? "Envoyé avant l'arrivée de cet appareil" : "Message illisible")}</p>;
  return (
    <div className="space-y-2">
      {p.t && <p className="whitespace-pre-line break-words">{p.t}</p>}
      {p.gif && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.gif.url} alt="" className="max-h-60" />
      )}
      {p.img && <SecretImage file={p.img} />}
      {p.post && <SharedPost id={p.post} />}
    </div>
  );
}

/** Downloads the encrypted bytes and decrypts them in the browser. */
function SecretImage({ file }: { file: NonNullable<Payload["img"]> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    void (async () => {
      const data = await fetch(`/api/chat/files/${file.id}`).then((r) => r.arrayBuffer());
      const plain = await openBytes(file.k, file.iv, data);
      u = URL.createObjectURL(new Blob([plain], { type: file.mime }));
      setUrl(u);
    })().catch(() => {});
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [file]);
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
