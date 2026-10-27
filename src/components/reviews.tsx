import Link from "next/link";
import { Mic } from "lucide-react";
import { StarShape } from "./marks";
import { fmtRating } from "@/lib/rating";
import { tag, type Locale, type T } from "@/lib/i18n";
import { CRITERIA } from "@/lib/deep";
import { img } from "@/lib/tmdb";
import type { PublicReview } from "@/lib/reviews";

const label = Object.fromEntries(CRITERIA.map((c) => [c.key, c.label]));
const when = (iso: string, locale: Locale) => new Date(iso).toLocaleDateString(tag(locale), { day: "2-digit", month: "short" });

function StaticStars({ value, t }: { value: number; t: T }) {
  return (
    <span className="flex gap-0.5" aria-label={t("{n} sur 5", { n: fmtRating(value) })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarShape key={n} fill={Math.max(0, Math.min(1, value - (n - 1)))} size={13} />
      ))}
    </span>
  );
}

function Blocks({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-2.5 w-3 ${n <= Math.round(value) ? "bg-lime" : "bg-bone/10"}`} />
      ))}
    </span>
  );
}

/** Reviews list. With showTitle, each entry names the title (member profile); otherwise the author (title page). */
export function ReviewList({ items, showTitle = false, t, locale }: { items: PublicReview[]; showTitle?: boolean; t: T; locale: Locale }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((r, i) => (
        <li key={`${r.handle}-${r.title?.tmdbId}-${i}`} className="grid gap-3 py-5 md:grid-cols-[12rem_1fr] md:gap-8">
          <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-2">
            {showTitle && r.title ? (
              <Link href={`/t/${r.title.kind}/${r.title.tmdbId}`} className="flex items-center gap-3 hover:text-lime">
                {r.title.posterPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img(r.title.posterPath, "w342")!} alt="" className="h-16 w-11 object-cover" />
                )}
                <span className="font-display text-sm font-semibold leading-tight">{r.title.name}</span>
              </Link>
            ) : (
              <Link href={`/u/${r.handle}`} className="font-mono text-sm text-bone hover:text-lime">
                @{r.handle}
              </Link>
            )}
            <span className="flex items-center gap-3">
              {r.rating ? <StaticStars value={r.rating} t={t} /> : null}
              <span className="font-mono text-[11px] text-dim">{when(r.at, locale)}</span>
            </span>
          </div>
          <div className="min-w-0 space-y-3">
            {r.body && (
              <p className="leading-relaxed text-bone/90">
                {r.voice && <Mic size={14} className="mr-2 inline align-[-2px] text-lime" aria-label={t("Vocal")} />}
                {r.body}
              </p>
            )}
            {!r.body && r.voice && (
              <p className="flex items-center gap-2 font-mono text-xs text-dim">
                <Mic size={14} className="text-lime" /> {t("Vocal")}
              </p>
            )}
            {r.scores && Object.keys(r.scores).length > 0 && (
              <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                {CRITERIA.filter((c) => r.scores![c.key]).map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-bone/70">{t(c.label)}</dt>
                    <dd>
                      <Blocks value={r.scores![c.key]} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {r.tags && r.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {r.tags.map((tg) => (
                  <span key={tg} className="border border-line px-2 py-0.5 text-xs text-bone/80">
                    {t(tg)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Averages of every detailed review of one title. */
export function DeepSummary({ count, scores, tags, t }: { count: number; scores: Record<string, number>; tags: { tag: string; n: number }[]; t: T }) {
  if (!count) return null;
  return (
    <div className="mb-10 grid gap-8 md:grid-cols-[1fr_auto] md:gap-16">
      <dl className="grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
        {Object.entries(scores)
          .filter(([k]) => label[k])
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[1fr_auto_2.5rem] items-center gap-3 text-sm">
              <dt>{t(label[k])}</dt>
              <dd>
                <Blocks value={v} />
              </dd>
              <dd className="text-right font-mono text-xs tabular-nums text-lime">{v.toFixed(1)}</dd>
            </div>
          ))}
      </dl>
      {tags.length > 0 && (
        <div className="flex max-w-xs flex-wrap content-start gap-1.5">
          {tags.map((x) => (
            <span key={x.tag} className="border border-line px-2 py-0.5 text-xs">
              {t(x.tag)} <span className="font-mono text-lime">{x.n}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
