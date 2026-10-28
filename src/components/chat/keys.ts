"use client";
import { useCallback, useEffect, useState } from "react";
import { createKeys, forgetKey, loadKey, openKeys, storeKey, type Wrapped } from "@/lib/e2e";

type State = { status: "loading" } | { status: "setup"; userId: string } | { status: "locked"; userId: string; wrapped: Wrapped } | { status: "ready"; userId: string; key: CryptoKey };

/** This device's chat key: created once with a secret code, unlocked once per device, kept in IndexedDB. */
export function useChatKey() {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/chat/keys").then((x) => x.json() as Promise<{ userId: string; keys: Wrapped | null }>);
      if (!r.keys) return setState({ status: "setup", userId: r.userId });
      const key = await loadKey(r.userId);
      setState(key ? { status: "ready", userId: r.userId, key } : { status: "locked", userId: r.userId, wrapped: r.keys });
    })().catch(() => setState({ status: "loading" }));
  }, []);

  const setup = useCallback(
    async (code: string, reset = false) => {
      if (state.status === "loading" || state.status === "ready") return;
      const { wrapped, privateKey } = await createKeys(code);
      const res = await fetch("/api/chat/keys", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...wrapped, reset }) });
      if (!res.ok) throw new Error("save");
      await forgetKey(state.userId).catch(() => {});
      await storeKey(state.userId, privateKey);
      setState({ status: "ready", userId: state.userId, key: privateKey });
    },
    [state],
  );

  const unlock = useCallback(
    async (code: string) => {
      if (state.status !== "locked") return;
      const key = await openKeys(state.wrapped, code);
      await storeKey(state.userId, key);
      setState({ status: "ready", userId: state.userId, key });
    },
    [state],
  );

  return { state, setup, unlock };
}
