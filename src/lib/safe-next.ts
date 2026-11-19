/** Where to go after signing in: only a path on this site ("/x"), never "//evil" or "/\evil". */
export function safeNext(next: string) {
  return /^\/(?![\/\\])[^\\\s]*$/.test(next) && !/[\x00-\x1f]/.test(next) ? next : "/";
}
