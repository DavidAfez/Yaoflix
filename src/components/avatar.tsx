/** Member picture, or the first letter of the handle on the accent colour. */
export function Avatar({ id, handle, size = 36, className = "" }: { id: string | null | undefined; handle: string; size?: number; className?: string }) {
  return id ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/images/${id}`} alt="" style={{ width: size, height: size }} className={`shrink-0 object-cover ${className}`} />
  ) : (
    <span style={{ width: size, height: size, fontSize: size * 0.45 }} className={`grid shrink-0 place-items-center bg-lime font-display font-extrabold uppercase text-ink ${className}`}>
      {handle.charAt(0)}
    </span>
  );
}
