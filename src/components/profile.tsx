"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Ban, Camera, Check, Flag, History, ImagePlus, Mail, MoreHorizontal, Pencil, Plus, X } from "lucide-react";
import { saveProfileCard, saveTop5 } from "@/app/me/actions";
import { useLocale, useT } from "./i18n";
import { Dots } from "./ui";
import { FollowButton, TitlePicker } from "./feed";
import { toRef } from "./post-kinds";
import { ReportSheet, blockUser } from "./safety";
import { Avatar } from "./avatar";
export { Avatar };
import type { ProfileHead } from "@/lib/profile";
import type { TitleRef } from "@/db/schema";

async function upload(file: File) {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/images", { method: "POST", body: fd }).catch(() => null);
  return ((await res?.json().catch(() => null)) as { id?: string; error?: string } | null) ?? { error: "Envoi impossible" };
}

/** Banner, avatar, handle, bio, join date and follow counts, Twitter style without the personal data. */
export function ProfileHeader({ head, mine, actions }: { head: ProfileHead; mine: boolean; actions?: React.ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [blocked, setBlocked] = useState(head.blocked);
  const [, start] = useTransition();
  const joined = new Date(head.joined).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" });

  return (
    <header className="-mx-4 md:-mx-10">
      <div className="relative aspect-[3/1] max-h-72 w-full overflow-hidden bg-gradient-to-br from-lime/30 via-ink-3 to-ink md:aspect-[4/1]">
        {head.bannerId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/images/${head.bannerId}`} alt="" className="size-full object-cover" />
        )}
      </div>
      <div className="px-4 md:px-10">
        <div className="flex items-end justify-between gap-4">
          <Avatar id={head.avatarId} handle={head.handle} size={112} className="relative z-10 -mt-14 border-4 border-ink md:-mt-16 md:size-32" />
          <div className="flex items-center gap-2 pt-3">
            {actions}
            {mine ? (
              <button onClick={() => setEditing(true)} aria-label={t("Éditer le profil")} title={t("Éditer le profil")} className="grid size-10 place-items-center border border-line hover:border-lime hover:text-lime">
                <Pencil size={16} />
              </button>
            ) : (
              <>
                <Link href={`/chat?to=${head.handle}`} aria-label={t("Message")} title={t("Message")} className="grid size-10 place-items-center border border-line hover:border-lime hover:text-lime">
                  <Mail size={16} />
                </Link>
                {!blocked && <FollowButton handle={head.handle} following={head.following} />}
                <div className="relative">
                  <button onClick={() => setMenu(!menu)} aria-label={t("Plus")} className="grid size-10 place-items-center border border-line hover:border-bone/40">
                    <MoreHorizontal size={16} />
                  </button>
                  <AnimatePresence>
                    {menu && (
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 top-12 z-30 w-56 border-l-2 border-coral bg-ink-2 py-1 shadow-2xl shadow-black/60">
                        <button
                          onClick={() => {
                            setMenu(false);
                            setBlocked(!blocked);
                            start(() => blockUser(head.handle, !blocked));
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-bone/5 hover:text-coral"
                        >
                          <Ban size={15} /> {t(blocked ? "Débloquer" : "Bloquer")}
                        </button>
                        <button
                          onClick={() => {
                            setMenu(false);
                            setReporting(true);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-bone/5 hover:text-coral"
                        >
                          <Flag size={15} /> {t("Signaler")}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>
        </div>
        <h1 className="mt-4 break-all font-display text-4xl font-extrabold leading-none md:text-6xl">@{head.handle}</h1>
        {head.bio && <p className="mt-3 max-w-xl whitespace-pre-line leading-relaxed text-bone/90">{head.bio}</p>}
        <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-dim">
          <span>{t("Depuis {date}", { date: joined })}</span>
          <span>
            <b className="font-semibold text-bone">{head.follows}</b> {t("abonnements")}
          </span>
          <span>
            <b className="font-semibold text-bone">{head.followers}</b> {t("abonnés")}
          </span>
          {blocked && <span className="text-coral">{t("Bloqué")}</span>}
        </p>
      </div>
      <AnimatePresence>{editing && <EditCard head={head} onClose={() => setEditing(false)} />}</AnimatePresence>
      <AnimatePresence>{reporting && <ReportSheet target={{ type: "user", id: head.id, label: `@${head.handle}` }} onClose={() => setReporting(false)} />}</AnimatePresence>
    </header>
  );
}

function EditCard({ head, onClose }: { head: ProfileHead; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [bio, setBio] = useState(head.bio ?? "");
  const [avatar, setAvatar] = useState(head.avatarId);
  const [banner, setBanner] = useState(head.bannerId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const pick = async (file: File | undefined, set: (id: string) => void, which: string) => {
    if (!file) return;
    setBusy(which);
    const r = await upload(file);
    setBusy(null);
    if (r.id) set(r.id);
    else setError(t(r.error ?? "Envoi impossible"));
  };
  const save = async () => {
    setBusy("save");
    const r = await saveProfileCard({ bio, avatarId: avatar, bannerId: banner });
    setBusy(null);
    if (!r.ok) return setError(t(r.error ?? "Oups"));
    onClose();
    router.refresh();
  };
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[90] bg-ink/70 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[95] max-h-[92dvh] overflow-y-auto border-t-2 border-lime bg-ink-2 pb-[calc(env(safe-area-inset-bottom)+24px)] md:inset-x-auto md:left-1/2 md:top-1/2 md:bottom-auto md:w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:border-l-2 md:border-t-0"
      >
        <div className="relative aspect-[3/1] bg-gradient-to-br from-lime/30 via-ink-3 to-ink">
          {banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/images/${banner}`} alt="" className="size-full object-cover" />
          )}
          <button onClick={() => bannerInput.current?.click()} aria-label={t("Bannière")} title={t("Bannière")} className="absolute inset-0 grid place-items-center bg-ink/30 opacity-80 hover:opacity-100">
            {busy === "banner" ? <Dots /> : <ImagePlus size={24} />}
          </button>
          <input ref={bannerInput} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0], setBanner, "banner")} />
        </div>
        <div className="px-5 md:px-8">
          <div className="relative z-10 -mt-10 w-fit">
            <Avatar id={avatar} handle={head.handle} size={88} className="border-4 border-ink-2" />
            <button onClick={() => avatarInput.current?.click()} aria-label={t("Avatar")} title={t("Avatar")} className="absolute inset-1 grid place-items-center bg-ink/40 opacity-80 hover:opacity-100">
              {busy === "avatar" ? <Dots /> : <Camera size={20} />}
            </button>
            <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0], setAvatar, "avatar")} />
          </div>
          <label className="mt-6 block">
            <span className="mb-2 flex justify-between font-mono text-[11px] uppercase tracking-widest text-dim">
              {t("Bio")} <span>{160 - bio.length}</span>
            </span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 160))} rows={3} className="w-full resize-none border border-line bg-transparent p-3 outline-none focus:border-lime" />
          </label>
          {error && <p className="mt-2 text-sm text-coral">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} aria-label={t("Annuler")} title={t("Annuler")} className="grid size-11 place-items-center border border-line hover:border-bone/40">
              <X size={18} />
            </button>
            <button onClick={save} aria-label={t("Enregistrer")} title={t("Enregistrer")} className="notch grid h-11 w-16 place-items-center bg-lime text-ink">
              {busy === "save" ? <Dots /> : <Check size={18} />}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

type Tops = { current: { id: number; items: TitleRef[]; at: string } | null; history: { id: number; items: TitleRef[]; at: string }[] };

/** The profile top 5, right under the counters. Own profile: edit, start over, look back. */
export function Top5Shelf({ tops, mine }: { tops: Tops; mine: boolean }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<TitleRef[] | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [history, setHistory] = useState(false);
  const [pending, start] = useTransition();
  const items = draft ?? tops.current?.items ?? [];
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  if (!mine && !tops.current) return null;

  const move = (i: number, d: number) => {
    if (!draft) return;
    const n = [...draft];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setDraft(n);
  };

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-display text-lg font-semibold md:text-xl">{t("Top 5")}</h2>
        {tops.current && !draft && <span className="font-mono text-[11px] text-dim">{date(tops.current.at)}</span>}
        <div className="ml-auto flex items-center gap-1">
          {draft ? (
            <>
              <IconBtn label={t("Annuler")} onClick={() => (setDraft(null), setSlot(null))}>
                <X size={16} />
              </IconBtn>
              <IconBtn
                label={t("Enregistrer")}
                strong
                disabled={!draft.length || pending}
                onClick={() =>
                  start(async () => {
                    await saveTop5(draft);
                    setDraft(null);
                    setSlot(null);
                    router.refresh();
                  })
                }
              >
                {pending ? <Dots /> : <Check size={16} />}
              </IconBtn>
            </>
          ) : (
            <>
              {mine && tops.current && (
                <IconBtn label={t("Modifier")} onClick={() => setDraft([...tops.current!.items])}>
                  <Pencil size={15} />
                </IconBtn>
              )}
              {mine && (
                <IconBtn label={t("Nouveau top 5")} onClick={() => setDraft([])}>
                  <Plus size={16} />
                </IconBtn>
              )}
              {tops.history.length > 0 && (
                <IconBtn label={t("Anciens top 5")} on={history} onClick={() => setHistory(!history)}>
                  <History size={15} />
                </IconBtn>
              )}
            </>
          )}
        </div>
      </div>

      <ol className="grid grid-cols-5 gap-2 md:max-w-3xl md:gap-4">
        {Array.from({ length: 5 }, (_, i) => {
          const it = items[i];
          return (
            <li key={i} className="relative">
              <span className="absolute -left-1 -top-2 z-10 font-display text-2xl font-extrabold text-lime drop-shadow md:text-3xl">{i + 1}</span>
              {it ? (
                <div className="group relative">
                  <Link href={draft ? "#" : `/t/${it.kind}/${it.tmdbId}`} onClick={(e) => draft && (e.preventDefault(), setSlot(i))} className="block aspect-[2/3] overflow-hidden bg-ink-3">
                    {it.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.poster} alt={it.name} className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center p-2 text-center text-xs text-bone/60">{it.name}</span>
                    )}
                  </Link>
                  {draft && (
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/80">
                      <button onClick={() => move(i, -1)} aria-label={t("Monter")} className="grid size-7 place-items-center hover:text-lime"><ArrowLeft size={13} /></button>
                      <button onClick={() => setDraft(draft.filter((_, j) => j !== i))} aria-label={t("Retirer")} className="grid size-7 place-items-center hover:text-coral"><X size={13} /></button>
                      <button onClick={() => move(i, 1)} aria-label={t("Descendre")} className="grid size-7 place-items-center hover:text-lime"><ArrowRight size={13} /></button>
                    </div>
                  )}
                  <p className="mt-1.5 hidden truncate text-xs text-bone/80 md:block">{it.name}</p>
                </div>
              ) : (
                <button
                  disabled={!mine}
                  onClick={() => {
                    if (!draft) setDraft([...(tops.current?.items ?? [])]);
                    setSlot(i);
                  }}
                  aria-label={t("Ajouter")}
                  className="grid aspect-[2/3] w-full place-items-center border border-dashed border-line text-dim enabled:hover:border-lime enabled:hover:text-lime"
                >
                  {mine && <Plus size={18} />}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <AnimatePresence>
        {draft && slot !== null && (
          <div className="mt-3 md:max-w-3xl">
            <TitlePicker
              onPick={(p) => {
                const r = toRef(p);
                const n = [...draft];
                if (n.some((x) => x.kind === r.kind && x.tmdbId === r.tmdbId)) return setSlot(null);
                if (slot < n.length) n[slot] = r;
                else n.push(r);
                setDraft(n.slice(0, 5));
                setSlot(null);
              }}
              onClose={() => setSlot(null)}
            />
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {history && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-5 space-y-3 overflow-hidden md:max-w-3xl">
            {tops.history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 border-t border-line pt-3">
                <span className="w-24 shrink-0 font-mono text-[11px] text-dim">{date(h.at)}</span>
                <div className="flex gap-1.5">
                  {h.items.map((it, i) => (
                    <Link key={i} href={`/t/${it.kind}/${it.tmdbId}`} title={`${i + 1}. ${it.name}`} className="block h-14 w-10 overflow-hidden bg-ink-3">
                      {it.poster && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.poster} alt="" className="size-full object-cover" />
                      )}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

function IconBtn({ label, onClick, children, on, strong, disabled }: { label: string; onClick: () => void; children: React.ReactNode; on?: boolean; strong?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid size-9 place-items-center border transition-colors disabled:opacity-40 ${strong ? "border-lime bg-lime text-ink" : on ? "border-lime text-lime" : "border-line hover:border-bone/40"}`}
    >
      {children}
    </button>
  );
}
