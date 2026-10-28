/**
 * End-to-end encryption for the chat, in the browser only (WebCrypto).
 *
 * - Each member has one ECDH P-256 key pair. The private key leaves the browser only wrapped
 *   with AES-GCM under a key derived from their secret code (PBKDF2-SHA256, 310 000 rounds).
 *   The server stores the wrapped blob and cannot open it.
 * - A thread key is ECDH(my private, their public) passed through HKDF with the thread id:
 *   both members derive the same AES-256-GCM key, nobody else can.
 * - Every message and attachment is AES-GCM with a fresh 96-bit IV.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
export const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
export const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

async function codeKey(code: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export type Wrapped = { publicKey: string; wrappedKey: string; salt: string; iv: string };

/** New key pair, the private half wrapped with the secret code. */
export async function createKeys(code: string): Promise<{ wrapped: Wrapped; privateKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey(ECDH, true, ["deriveBits"])) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const box = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await codeKey(code, salt), enc.encode(JSON.stringify(priv)));
  const privateKey = await crypto.subtle.importKey("jwk", priv, ECDH, false, ["deriveBits"]);
  return { wrapped: { publicKey: JSON.stringify(pub), wrappedKey: b64(box), salt: b64(salt), iv: b64(iv) }, privateKey };
}

/** Opens the wrapped private key. Throws on a wrong code. */
export async function openKeys(w: Wrapped, code: string): Promise<CryptoKey> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(w.iv) }, await codeKey(code, unb64(w.salt)), unb64(w.wrappedKey));
  return crypto.subtle.importKey("jwk", JSON.parse(dec.decode(plain)) as JsonWebKey, ECDH, false, ["deriveBits"]);
}

const threadKeys = new Map<string, Promise<CryptoKey>>();

export function threadKey(mine: CryptoKey, theirPublic: string, threadId: string): Promise<CryptoKey> {
  const k = `${threadId}:${theirPublic.length}:${theirPublic.slice(-24)}`;
  if (!threadKeys.has(k)) {
    threadKeys.set(
      k,
      (async () => {
        const pub = await crypto.subtle.importKey("jwk", JSON.parse(theirPublic) as JsonWebKey, ECDH, false, []);
        const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, mine, 256);
        const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
        return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode(threadId), info: enc.encode("gabaoflix-chat-v1") }, hk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      })(),
    );
  }
  return threadKeys.get(k)!;
}

export async function seal(key: CryptoKey, data: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
  return { iv: b64(iv), body: b64(body) };
}

export async function open<T>(key: CryptoKey, iv: string, body: string): Promise<T | null> {
  try {
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(body)))) as T;
  } catch {
    return null;
  }
}

export async function sealBytes(key: CryptoKey, bytes: ArrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), data: await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes) };
}

export async function openBytes(key: CryptoKey, iv: string, data: ArrayBuffer) {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, data);
}

/* The unwrapped private key stays on this device in IndexedDB, as a non-extractable CryptoKey. */
const DB = "gabaoflix-e2e";
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function storeKey(userId: string, key: CryptoKey) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    tx.objectStore("keys").put(key, userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function loadKey(userId: string): Promise<CryptoKey | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction("keys").objectStore("keys").get(userId);
      r.onsuccess = () => resolve((r.result as CryptoKey | undefined) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
export async function forgetKey(userId: string) {
  const db = await idb();
  db.transaction("keys", "readwrite").objectStore("keys").delete(userId);
}
