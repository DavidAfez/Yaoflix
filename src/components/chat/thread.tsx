"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowLeft, Check, Flag, ShieldCheck } from "lucide-react";
import { fingerprint, open, openBytes, safetyNumber, seal, sealBytes, type Device, type Me } from "@/lib/e2e";
import { Avatar } from "../avatar";
import { PostCard } from "../feed";
import { useLocale, useT } from "../i18n";
import { ReportSheet } from "../safety";
import { Dots } from "../ui";
import { acceptKey, peer, type Peer } from "./peers";
import type { Attachment, Msg, Payload, Thread } from "./message";
import { ChatComposer, type Staged } from "./composer";
import { PollBody, Thumb, TierView, Top5View } from "../post-kinds";
import type { FeedPost } from "@/lib/feed";

type Item = Msg & { p: Payload | null };

export function ThreadView({ thread, me, mine, myRoot, onBack }: { thread: Thread; me: Me; mine: Device[]; myRoot: Device; onBack: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<Item | null>(null);
  const [other, setOther] = useState<Peer | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const [showSafety, setShowSafety] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
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

  // Braces matter: recent browsers make scrollIntoView return a Promise, which an effect must not return
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  const send = async (p: Payload): Promise<boolean> => {
    setBusy(true);
    try {
      // Fresh device list each time: a device added a minute ago gets the message too
      const o = await refreshPeer();
      if (!o?.devices.length || o.changed) return false;
      const sealed = await seal(me, [...o.devices, ...mine], p);
      const res = await fetch(`/api/chat/threads/${thread.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: me.id, ...sealed }) });
      if (!res.ok) return false;
      const m = (await res.json()) as Msg;
      last.current = m.at;
      setItems((x) => [...x, { ...m, p }]);
      return true;
    } finally {
      setBusy(false);
    }
  };

  /** Pictures are encrypted here, each with its own key, then sent with the rest of the message. */
  const sendAll = async (p: Omit<Payload, "media">, files: Staged[]) => {
    setBusy(true);
    const media: Attachment[] = [];
    for (const f of files) {
      if (f.type === "gif") {
        media.push(f);
        continue;
      }
      const { k, iv, data } = await sealBytes(await f.file.arrayBuffer());
      const res = await fetch(`/api/chat/files?thread=${thread.id}`, { method: "POST", body: data });
      const d = (await res.json().catch(() => ({}))) as { id?: string };
      if (!d.id) {
        setBusy(false);
        return false;
      }
      media.push({ type: "img", id: d.id, iv, k, mime: f.file.type || "image/jpeg" });
    }
    return send({ ...p, ...(media.length ? { media } : {}) });
  };

  // Votes travel as encrypted messages too: count them here, one per member, first one wins
  const votes = new Map<string, { counts: Map<string, number>; mine: number | null }>();
  for (const m of items) {
    const v = m.p?.vote;
    if (!v) continue;
    const tally = votes.get(v.of) ?? { counts: new Map(), mine: null };
    const who = m.mine ? "me" : "them";
    if (!tally.counts.has(who)) tally.counts.set(who, v.option);
    if (m.mine && tally.mine === null) tally.mine = v.option;
    votes.set(v.of, tally);
  }
  const pollState = (id: string, n: number) => {
    const tally = votes.get(id);
    const counts = Array.from({ length: n }, () => 0);
    tally?.counts.forEach((o) => o < n && counts[o]++);
    return { counts, mine: tally?.mine ?? null };
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
        {items.filter((m) => !m.p?.vote).map((m) => (
          <div key={m.id} className={`group flex items-end gap-2 ${m.mine ? "justify-end" : ""}`}>
            {!m.mine && m.p && (
              <button onClick={() => setReporting(m)} aria-label={t("Signaler")} className="order-last text-dim opacity-0 transition-opacity hover:text-coral group-hover:opacity-100">
                <Flag size={12} />
              </button>
            )}
            <div className={`max-w-[80%] ${m.mine ? "bg-lime/90 text-ink" : "bg-ink-2"} px-3 py-2`}>
              <Bubble p={m.p} missing={!m.key} mine={m.mine} poll={m.p?.rich?.kind === "poll" ? { ...pollState(m.id, m.p.rich.data.options.length), vote: (o) => void send({ vote: { of: m.id, option: o } }) } : undefined} />
              <p className={`mt-1 text-right font-mono text-[9px] ${m.mine ? "text-ink/60" : "text-dim"}`}>
                {new Date(m.at).toLocaleTimeString(locale === "en" ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <ChatComposer busy={busy} disabled={other?.changed} onSend={sendAll} />
      <AnimatePresence>
        {reporting && <ReportSheet target={{ type: "message", id: reporting.id, label: `@${thread.other.handle}`, text: reporting.p?.t ?? "" }} onClose={() => setReporting(null)} />}
      </AnimatePresence>
    </section>
  );
}

function Bubble({ p, missing, mine, poll }: { p: Payload | null; missing: boolean; mine: boolean; poll?: { counts: number[]; mine: number | null; vote: (o: number) => void } }) {
  const t = useT();
  if (!p) return <p className="text-xs italic opacity-60">{t(missing ? "Envoyé avant l'arrivée de cet appareil" : "Message illisible")}</p>;
  // Older messages carried a single picture or GIF
  const media: Attachment[] = [...(p.media ?? []), ...(p.gif ? [p.gif] : []), ...(p.img ? [{ type: "img" as const, ...p.img }] : [])];
  return (
    <div className="space-y-2">
      {p.title && (
        <Link href={`/t/${p.title.kind}/${p.title.tmdbId}`} className="flex items-center gap-3 border border-current/20 p-1.5 pr-3 hover:opacity-80">
          <Thumb item={{ type: "title", ...p.title }} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-display font-semibold">{p.title.name}</span>
            <span className="font-mono text-[10px] opacity-60">{p.title.year}</span>
          </span>
        </Link>
      )}
      {p.rich && (
        // Builders' views are made for the dark theme: keep them on dark even inside my own bubble
        <div className={mine ? "-mx-3 bg-ink px-3 py-3 text-bone" : ""}>
          {p.rich.kind === "top5" && <Top5View data={p.rich.data} />}
          {p.rich.kind === "tier" && <TierView data={p.rich.data} />}
          {p.rich.kind === "poll" && poll && <PollBody data={p.rich.data} counts={poll.counts} mine={poll.mine} author={mine} onVote={poll.vote} />}
        </div>
      )}
      {media.length > 0 && (
        <div className={`grid gap-1 ${media.length > 1 ? "grid-cols-2" : ""}`}>
          {media.map((m, i) =>
            m.type === "gif" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={m.url} alt="" className="max-h-60 w-full object-cover" />
            ) : (
              <SecretImage key={m.id} file={m} />
            ),
          )}
        </div>
      )}
      {p.t && <p className="whitespace-pre-line break-words">{p.t}</p>}
      {p.post && <SharedPost id={p.post} />}
    </div>
  );
}

/** Downloads the encrypted bytes and decrypts them in the browser. */
function SecretImage({ file }: { file: Extract<Attachment, { type: "img" }> | NonNullable<Payload["img"]> }) {
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
