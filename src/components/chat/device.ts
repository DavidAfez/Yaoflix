"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createDevice, deviceLabel, dropMe, keepStorage, loadMe, rewrap, saveMe, shortCode, trusted, unwrapFrom, vouch, type Device, type Me, type PublicDevice } from "@/lib/e2e";

export type DeviceState =
  | { status: "loading" }
  | { status: "none" } // not set up on this device, and asked not to create it here
  | { status: "pending"; userId: string; me: Me; code: string }
  | { status: "ready"; userId: string; me: Me; mine: Device[]; root: Device; waiting: (Device & { code: string })[] };

type Listing = { userId: string; devices: Device[] };
const list = () => fetch("/api/chat/devices").then((r) => (r.ok ? (r.json() as Promise<Listing>) : Promise.reject(new Error("devices"))));

async function register(me: Me, pub: { id: string; ecdh: string; sign: string; sig: string }, reset = false) {
  const res = await fetch("/api/chat/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pub, label: deviceLabel(), reset }) });
  if (!res.ok) throw new Error("register");
  await saveMe(me);
  return (await res.json()) as { approved: boolean };
}

/**
 * This browser's chat keys. Created on first use without any code: the first device is
 * trusted at once, the next ones wait for a trusted device to let them in.
 */
export function useChatDevice({ create = true }: { create?: boolean } = {}) {
  const [state, setState] = useState<DeviceState>({ status: "loading" });
  const alive = useRef(true);

  const load = useCallback(async () => {
    const { userId, devices } = await list();
    let me = await loadMe(userId);
    const mineOnServer = me ? devices.find((d) => d.id === me!.id) : undefined;
    if (me && !mineOnServer) {
      // Removed from another device, or a reset elsewhere: this copy is useless
      await dropMe(userId);
      me = null;
    }
    if (!me) {
      if (!create) return setState({ status: "none" });
      keepStorage();
      const made = await createDevice(userId);
      const { approved } = await register(made.me, made.pub);
      if (!approved) return setState({ status: "pending", userId, me: made.me, code: await shortCode(made.pub) });
      return load();
    }
    if (!mineOnServer!.approved) return setState({ status: "pending", userId, me, code: await shortCode(mineOnServer!) });
    const { root, devices: ok } = await trusted(userId, devices);
    if (!root || !ok.some((d) => d.id === me!.id)) return setState({ status: "pending", userId, me, code: await shortCode(mineOnServer!) });
    const waiting = await Promise.all(devices.filter((d) => !d.approved).map(async (d) => ({ ...d, code: await shortCode(d) })));
    if (alive.current) setState({ status: "ready", userId, me, mine: ok, root, waiting });
  }, [create]);

  useEffect(() => {
    alive.current = true;
    void load().catch(() => setState({ status: "loading" }));
    return () => {
      alive.current = false;
    };
  }, [load]);

  // Waiting for approval: check every few seconds. Ready: notice new devices asking to join.
  useEffect(() => {
    if (state.status !== "pending" && state.status !== "ready") return;
    const h = setInterval(() => void load().catch(() => {}), state.status === "pending" ? 3000 : 15_000);
    return () => clearInterval(h);
  }, [state.status, load]);

  /** Lost every other device: this one becomes the root. Older messages stay unreadable here. */
  const reset = useCallback(async () => {
    if (state.status !== "pending") return;
    const made = await createDevice(state.userId);
    await register(made.me, made.pub, true);
    await load();
  }, [state, load]);

  /** Vouch for a waiting device, then hand it the history this device can read. */
  const approve = useCallback(
    async (d: Device, progress: (n: number) => void) => {
      if (state.status !== "ready") return;
      const { me } = state;
      const sig = await vouch(me, d);
      const res = await fetch(`/api/chat/devices/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", signedBy: me.id, sig }) });
      if (!res.ok) throw new Error("approve");
      const to: PublicDevice = { id: d.id, ecdh: d.ecdh };
      let done = 0;
      for (let offset = 0; ; offset += 400) {
        const page = (await fetch(`/api/chat/rekey?device=${me.id}&offset=${offset}`).then((r) => r.json())) as { items: { messageId: string; wrap: string; from: PublicDevice }[] };
        if (!page.items?.length) break;
        const items = (
          await Promise.all(
            page.items.map(async (it) => {
              try {
                return { messageId: it.messageId, wrap: await rewrap(me, await unwrapFrom(me, it.from, it.wrap), to) };
              } catch {
                return null;
              }
            }),
          )
        ).filter((x) => x !== null);
        if (items.length) await fetch("/api/chat/rekey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: me.id, device: d.id, items }) });
        done += items.length;
        progress(done);
        if (page.items.length < 400) break;
      }
      await load();
    },
    [state, load],
  );

  const revoke = useCallback(
    async (d: Device) => {
      await fetch(`/api/chat/devices/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke" }) });
      await load();
    },
    [load],
  );

  return { state, reset, approve, revoke };
}
