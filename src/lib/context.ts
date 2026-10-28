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
 * Keyed hash of the client IP (HMAC with the server pepper). The IP itself is never stored;
 * the hash only serves to keep banned members from coming back with a new account.
 */
export function ipHashFrom(h: Headers): string | null {
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  if (!ip) return null;
  return blindIndex(ip, "ip");
}
