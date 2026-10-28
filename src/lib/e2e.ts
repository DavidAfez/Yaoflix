/**
 * End-to-end encryption for the chat, with WebCrypto only (browser, and the server for checks).
 *
 * - Each device makes two P-256 key pairs: ECDH to receive, ECDSA to vouch for other devices.
 *   The private halves are non-extractable and stay in this browser's IndexedDB. No passphrase.
 * - A member's first device is the root. A new device is vouched for by one already trusted
 *   (ECDSA signature), after the member compares a 6-digit code on both screens.
 * - A message is AES-256-GCM under a fresh random key. That key is wrapped (AES-GCM) for every
 *   trusted device of both members, with ECDH(sender device, recipient device) through HKDF.
 * - Contacts pin each other's root key (trust on first use) and get warned when it changes.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const ECDSA = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIG = { name: "ECDSA", hash: "SHA-256" } as const;
const AES = { name: "AES-GCM", length: 256 } as const;

/** A device as the server lists it: public keys and who vouched for it. */
export type Device = { id: string; userId: string; ecdh: string; sign: string; signedBy: string | null; sig: string; label: string; approved: boolean; createdAt: string };
/** This device, with its private keys. */
export type Me = { id: string; userId: string; ecdh: CryptoKeyPair; sign: CryptoKeyPair };
export type PublicDevice = { id: string; ecdh: string };

export const statement = (d: { userId: string; id: string; ecdh: string; sign: string }) => enc.encode(`gabaoflix-device-v1|${d.userId}|${d.id}|${d.ecdh}|${d.sign}`);

export async function createDevice(userId: string) {
  const ecdh = (await subtle().generateKey(ECDH, false, ["deriveBits"])) as CryptoKeyPair;
  const sign = (await subtle().generateKey(ECDSA, false, ["sign", "verify"])) as CryptoKeyPair;
  const id = crypto.randomUUID();
  const pub = { userId, id, ecdh: b64(await subtle().exportKey("raw", ecdh.publicKey)), sign: b64(await subtle().exportKey("raw", sign.publicKey)) };
  // Self-signed: proves the device holds the signing key it announces
  const sig = b64(await subtle().sign(SIG, sign.privateKey, statement(pub)));
  const me: Me = { id, userId, ecdh, sign };
  return { me, pub: { ...pub, sig } };
}

/** This device signs for another one of the same member. */
export async function vouch(me: Me, d: { userId: string; id: string; ecdh: string; sign: string }) {
  return b64(await subtle().sign(SIG, me.sign.privateKey, statement(d)));
}

export async function verifySig(signPub: string, data: Uint8Array<ArrayBuffer>, sig: string) {
  try {
    const key = await subtle().importKey("raw", unb64(signPub), ECDSA, false, ["verify"]);
    return await subtle().verify(SIG, key, unb64(sig), data);
  } catch {
    return false;
  }
}

/** The devices whose signatures chain back to the member's root. Anything else is ignored. */
export async function trusted(userId: string, devices: Device[]) {
  const mine = devices.filter((d) => d.userId === userId && d.approved);
  const roots = mine.filter((d) => !d.signedBy).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const root = roots[0];
  if (!root || !(await verifySig(root.sign, statement(root), root.sig))) return { root: null, devices: [] as Device[] };
  const ok = new Map([[root.id, root]]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of mine) {
      const by = d.signedBy ? ok.get(d.signedBy) : undefined;
      if (ok.has(d.id) || !by) continue;
      if (await verifySig(by.sign, statement(d), d.sig)) {
        ok.set(d.id, d);
        grew = true;
      }
    }
  }
  return { root, devices: [...ok.values()] };
}

const sha = async (s: string) => new Uint8Array(await subtle().digest("SHA-256", enc.encode(s)));
export const fingerprint = async (d: { ecdh: string; sign: string }) => b64(await sha(`${d.ecdh}|${d.sign}`));

/** 6 digits shown on both screens when a new device asks to join. */
export async function shortCode(d: { ecdh: string; sign: string }) {
  const h = await sha(`code|${d.ecdh}|${d.sign}`);
  const n = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, "0").replace(/(\d{3})(\d{3})/, "$1 $2");
}

/** Safety number of a conversation: the same on both sides as long as nobody swapped a key. */
export async function safetyNumber(a: string, b: string) {
  const h = await sha([a, b].sort().join("|"));
  const groups: string[] = [];
  for (let i = 0; i < 15; i += 3) groups.push(String(((h[i] << 16) | (h[i + 1] << 8) | h[i + 2]) % 100_000).padStart(5, "0"));
  return groups.join(" ");
}

const pairs = new Map<string, Promise<CryptoKey>>();
/** The key two devices share, derived on each side from its own private key and the other's public key. */
function pairKey(me: Me, other: PublicDevice) {
  const k = `${me.id}:${other.id}:${other.ecdh.slice(-16)}`;
  if (!pairs.has(k))
    pairs.set(
      k,
      (async () => {
        const pub = await subtle().importKey("raw", unb64(other.ecdh), ECDH, false, []);
        const bits = await subtle().deriveBits({ name: "ECDH", public: pub }, me.ecdh.privateKey, 256);
        const hk = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
        return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode([me.id, other.id].sort().join("|")), info: enc.encode("gabaoflix-wrap-v1") }, hk, AES, false, ["wrapKey", "unwrapKey"]);
      })(),
    );
  return pairs.get(k)!;
}

async function wrapFor(me: Me, to: PublicDevice, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const w = await subtle().wrapKey("raw", key, await pairKey(me, to), { name: "AES-GCM", iv });
  return `${b64(iv)}.${b64(w)}`;
}

export async function unwrapFrom(me: Me, from: PublicDevice, wrap: string) {
  const [iv, w] = wrap.split(".");
  return subtle().unwrapKey("raw", unb64(w), await pairKey(me, from), { name: "AES-GCM", iv: unb64(iv) }, AES, true, ["encrypt", "decrypt"]);
}

/** Hands an already opened message key to another device (history for a new device). */
export const rewrap = (me: Me, key: CryptoKey, to: PublicDevice) => wrapFor(me, to, key);

export async function seal(me: Me, to: PublicDevice[], data: unknown) {
  const key = await subtle().generateKey(AES, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
  const unique = [...new Map(to.map((d) => [d.id, d])).values()];
  const keys = await Promise.all(unique.map(async (d) => ({ device: d.id, wrap: await wrapFor(me, d, key) })));
  return { iv: b64(iv), body: b64(body), keys };
}

export async function open<T>(me: Me, from: PublicDevice, wrap: string, iv: string, body: string): Promise<T | null> {
  try {
    const key = await unwrapFrom(me, from, wrap);
    return JSON.parse(dec.decode(await subtle().decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(body)))) as T;
  } catch {
    return null;
  }
}

/** Attachments get their own random key, which travels inside the (encrypted) message. */
export async function sealBytes(bytes: ArrayBuffer) {
  const key = await subtle().generateKey(AES, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { k: b64(await subtle().exportKey("raw", key)), iv: b64(iv), data };
}

export async function openBytes(k: string, iv: string, data: ArrayBuffer) {
  const key = await subtle().importKey("raw", unb64(k), AES, false, ["decrypt"]);
  return subtle().decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, data);
}

/* Device keys and pinned contacts live in IndexedDB. CryptoKeys are stored as is, still non-extractable. */
const DB = "gabaoflix-e2e-v2";
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function put(key: string, value: unknown) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    if (value === undefined) tx.objectStore("kv").delete(key);
    else tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function get<T>(key: string): Promise<T | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction("kv").objectStore("kv").get(key);
      r.onsuccess = () => resolve((r.result as T | undefined) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export const saveMe = (me: Me) => put(`me:${me.userId}`, me);
export const loadMe = (userId: string) => get<Me>(`me:${userId}`);
export const dropMe = (userId: string) => put(`me:${userId}`, undefined);
export const getPin = (me: string, other: string) => get<string>(`pin:${me}:${other}`);
export const setPin = (me: string, other: string, fp: string) => put(`pin:${me}:${other}`, fp);

/** Asks the browser not to evict our keys under storage pressure (and Safari's 7-day rule). */
export function keepStorage() {
  void navigator.storage?.persist?.().catch(() => false);
  // The passphrase-based keys of the first version are useless now
  try {
    indexedDB.deleteDatabase("gabaoflix-e2e");
  } catch {}
}

export function deviceLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}
