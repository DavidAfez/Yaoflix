import { test } from "node:test";
import assert from "node:assert/strict";
import { createDevice, open, safetyNumber, seal, shortCode, trusted, vouch, sealBytes, openBytes, rewrap, unwrapFrom, type Device } from "@/lib/e2e";

const asDevice = (pub: { userId: string; id: string; ecdh: string; sign: string; sig: string }, signedBy: string | null, createdAt = new Date().toISOString()): Device => ({
  ...pub,
  signedBy,
  label: "test",
  approved: true,
  createdAt,
});

test("a message opens on every device it was sealed for, and nowhere else", async () => {
  const alice = await createDevice("alice");
  const bob = await createDevice("bob");
  const eve = await createDevice("eve");
  const msg = await seal(alice.me, [alice.pub, bob.pub], { text: "salut" });
  const forBob = msg.keys.find((k) => k.device === bob.pub.id)!;
  assert.deepEqual(await open(bob.me, alice.pub, forBob.wrap, msg.iv, msg.body), { text: "salut" });
  assert.equal(await open(eve.me, alice.pub, forBob.wrap, msg.iv, msg.body), null, "a stranger can't unwrap");
  assert.ok(!msg.body.includes("salut"));
});

test("history re-wrapped for a new device opens there", async () => {
  const a1 = await createDevice("alice");
  const a2 = await createDevice("alice");
  const bob = await createDevice("bob");
  const msg = await seal(bob.me, [a1.pub, bob.pub], { text: "vieux" });
  const key = await unwrapFrom(a1.me, bob.pub, msg.keys.find((k) => k.device === a1.pub.id)!.wrap);
  const wrap = await rewrap(a1.me, key, a2.pub);
  assert.deepEqual(await open(a2.me, a1.pub, wrap, msg.iv, msg.body), { text: "vieux" });
});

test("only devices vouched for by the root are trusted", async () => {
  const root = await createDevice("alice");
  const second = await createDevice("alice");
  const rogue = await createDevice("alice");
  const sig = await vouch(root.me, second.pub);
  const devices = [
    asDevice(root.pub, null, "2026-01-01T00:00:00Z"),
    asDevice({ ...second.pub, sig }, root.pub.id),
    asDevice(rogue.pub, root.pub.id), // claims the root signed it, but it's only self-signed
  ];
  const t = await trusted("alice", devices);
  assert.equal(t.root?.id, root.pub.id);
  assert.deepEqual(t.devices.map((d) => d.id).sort(), [root.pub.id, second.pub.id].sort());
});

test("codes and safety numbers are stable and symmetric", async () => {
  const a = await createDevice("a");
  const b = await createDevice("b");
  assert.match(await shortCode(a.pub), /^\d{3} \d{3}$/);
  assert.equal(await shortCode(a.pub), await shortCode(a.pub));
  assert.equal(await safetyNumber(a.pub.sign, b.pub.sign), await safetyNumber(b.pub.sign, a.pub.sign));
});

test("attachments round-trip under their own key", async () => {
  const bytes = new TextEncoder().encode("image").buffer;
  const s = await sealBytes(bytes);
  assert.equal(new TextDecoder().decode(await openBytes(s.k, s.iv, s.data)), "image");
});
