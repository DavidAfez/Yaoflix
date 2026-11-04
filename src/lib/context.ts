import { blindIndex } from "./crypto";
import { headers } from "next/headers";

/**
 * Country comes from the edge (Cloudflare, Vercel, or a reverse proxy with GeoIP).
 * The IP itself is never read nor stored.
 */
export function countryFrom(h: Headers): string | null {
  const c =
    h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country") ?? h.get("x-country-code") ?? h.get("cloudfront-viewer-country");
  if (!c || c === "XX" || c === "T1") return null;
  return c.toUpperCase().slice(0, 2);
}

export function deviceFrom(h: Headers): "mobile" | "tablet" | "tv" | "desktop" {
  const ua = (h.get("user-agent") ?? "").toLowerCase();
  if (/smart-?tv|tizen|webos|appletv|android tv|crkey|bravia/.test(ua)) return "tv";
  if (/ipad|tablet|(android(?!.*mobile))/.test(ua)) return "tablet";
  if (/mobi|iphone|android/.test(ua)) return "mobile";
  return "desktop";
}

export async function requestContext() {
  const h = await headers();
  return { country: countryFrom(h), device: deviceFrom(h) };
}

/**
 * The visitor's IP, from a header only a trusted proxy can set. A visitor can send any
 * x-forwarded-for or cf-connecting-ip they like, and Next passes them on untouched: trusting
 * them would let anyone dodge rate limits and IP bans by changing the header on each request.
 * - Online behind Cloudflare (APP_URL in https, or TRUST_PROXY=cloudflare): cf-connecting-ip,
 *   which Cloudflare overwrites. Keep the site reachable only through the tunnel.
 * - TRUST_PROXY=proxy: the address your own reverse proxy appends last to x-forwarded-for.
 * - Local http: x-forwarded-for as Next fills it from the connection.
 */
export function clientIp(h: Headers): string | null {
  const mode = process.env.TRUST_PROXY || (process.env.APP_URL?.startsWith("https://") ? "cloudflare" : "local");
  if (mode === "cloudflare") return h.get("cf-connecting-ip")?.trim() || null;
  const xff = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return (mode === "proxy" ? xff.at(-1) : xff[0]) ?? null;
}

/**
 * Keyed hash of the client IP (HMAC with the server pepper). The IP itself is never stored;
 * the hash only serves to keep banned members from coming back with a new account.
 */
export function ipHashFrom(h: Headers): string | null {
  const ip = clientIp(h);
  return ip ? blindIndex(ip, "ip") : null;
}
