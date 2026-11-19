/** Shown at once while a page fetches its data, so a tap always answers. */
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Chargement" className="mx-auto max-w-7xl px-4 pt-6 md:px-8">
      <div className="skeleton h-[38dvh] w-full md:h-[46dvh]" />
      <div className="skeleton mt-8 h-6 w-40" />
      <div className="mt-4 flex gap-3 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="skeleton aspect-[2/3] w-28 shrink-0 md:w-40" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </main>
  );
}
