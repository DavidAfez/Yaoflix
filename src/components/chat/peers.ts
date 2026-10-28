"use client";
import { fingerprint, getPin, setPin, trusted, type Device } from "@/lib/e2e";

export type Peer = { userId: string; devices: Device[]; root: Device | null; fp: string | null; changed: boolean };

/**
 * The other member's devices we may encrypt to: only those that chain back to their root key.
 * The root is pinned the first time; a different one later is flagged, never silently accepted.
 */
export async function peer(myUserId: string, handle: string): Promise<Peer | null> {
  const r = await fetch(`/api/chat/members/${encodeURIComponent(handle)}`);
  if (!r.ok) return null;
  const { userId, devices } = (await r.json()) as { userId: string; devices: Device[] };
  const t = await trusted(userId, devices);
  if (!t.root) return { userId, devices: [], root: null, fp: null, changed: false };
  const fp = await fingerprint(t.root);
  const pinned = await getPin(myUserId, userId);
  if (!pinned) await setPin(myUserId, userId, fp);
  return { userId, devices: t.devices, root: t.root, fp, changed: Boolean(pinned && pinned !== fp) };
}

export const acceptKey = (myUserId: string, p: Peer) => (p.fp ? setPin(myUserId, p.userId, p.fp) : Promise.resolve());
