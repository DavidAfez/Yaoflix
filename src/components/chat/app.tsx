"use client";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Lock, MonitorSmartphone, Send, ShieldCheck } from "lucide-react";
import { Avatar } from "../avatar";
import { useT } from "../i18n";
import { Dots } from "../ui";
import { useChatDevice } from "./device";
import type { Thread } from "./message";
import { Approval, DevicesSheet, PendingGate } from "./devices-ui";
import { ThreadView } from "./thread";

export function ChatApp({ to }: { to: string | null }) {
  const t = useT();
  const { state, reset, approve, revoke } = useChatDevice();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const [looked, setLooked] = useState("");

  // Members matching what is typed, from the same search as the rest of the site
  useEffect(() => {
    const q = handle.trim().replace(/^@/, "");
    if (!q) return setPeople([]);
    let stale = false;
    const h = setTimeout(async () => {
      const r = (await fetch(`/api/search?q=${encodeURIComponent(`@${q}`)}`).then((x) => x.json()).catch(() => ({}))) as { people?: { handle: string }[] };
      if (stale) return;
      setPeople((r.people ?? []).slice(0, 8).map((p) => p.handle));
      setLooked(q);
    }, 200);
    return () => {
      stale = true;
      clearTimeout(h);
    };
  }, [handle]);

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
          {people.length > 0 && (
            <ul className="mt-1 border border-line bg-ink-2">
              {people.map((h) => (
                <li key={h}>
                  <button onClick={() => void openWith(h)} className="flex w-full items-center gap-3 px-3 py-2 text-left font-mono text-sm transition-colors hover:bg-bone/5 hover:text-lime">
                    <Avatar id={null} handle={h} size={24} />@{h}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {handle.trim() && looked === handle.trim().replace(/^@/, "") && !people.length && <p className="mt-2 text-xs text-dim">{t("Aucun membre trouvé")}</p>}
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

