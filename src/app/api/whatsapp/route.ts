import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { blindIndex, safeEqual } from "@/lib/crypto";
import { downloadWhatsAppMedia } from "@/lib/notify/whatsapp";
import { logError } from "@/lib/errors";
import { paths } from "@/lib/storage";
import { enqueue } from "@/lib/jobs";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const token = process.env.WA_VERIFY_TOKEN;
  if (token && sp.get("hub.mode") === "subscribe" && safeEqual(sp.get("hub.verify_token") ?? "", token)) {
    return new Response(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response(null, { status: 403 });
}

type WaMessage = { from: string; type: string; audio?: { id: string; mime_type?: string } };
type WaPayload = { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] };

const EXT: Record<string, string> = { "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "ogg" };

/**
 * Incoming WhatsApp voice notes become feedback.
 * The sender number is matched through its blind index, it is never stored in clear.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.WA_APP_SECRET;
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  if (!secret || !safeEqual(sig, `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`)) {
    return new Response(null, { status: 401 });
  }
  try {
    const body = JSON.parse(raw) as WaPayload;
    const messages = body.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
    for (const m of messages) {
      if (m.type !== "audio" || !m.audio?.id) continue;
      const [user] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.phoneHash, blindIndex(m.from.replace(/\D/g, ""), "phone")));
      if (!user) continue;
      const [last] = await db
        .select({ titleId: schema.watchSessions.titleId })
        .from(schema.watchSessions)
        .where(eq(schema.watchSessions.userId, user.id))
        .orderBy(desc(schema.watchSessions.startedAt))
        .limit(1);
      const { data, mime } = await downloadWhatsAppMedia(m.audio.id);
      const base = mime.split(";")[0];
      const file = `${randomUUID()}.${EXT[base] ?? "ogg"}`;
      await mkdir(paths.voiceDir, { recursive: true });
      await writeFile(paths.voice(file), data);
      const [fb] = await db.insert(schema.feedback).values({
        userId: user.id,
        titleId: last?.titleId ?? null,
        audioFile: file,
        mime: base,
        source: "whatsapp",
      }).returning({ id: schema.feedback.id });
      await enqueue("transcribe", { feedbackId: fb.id });
    }
  } catch (e) {
    await logError("whatsapp", e, { where: "webhook" });
  }
  // Always 200 so Meta does not retry forever
  return NextResponse.json({ ok: true });
}
