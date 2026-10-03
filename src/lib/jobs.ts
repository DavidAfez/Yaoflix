import { db, schema } from "@/db";

export type JobType = "transcode" | "mail" | "whatsapp" | "watchlist-ready";

export async function enqueue(type: JobType, payload: Record<string, unknown>, delaySec = 0) {
  await db.insert(schema.jobs).values({ type, payload, runAt: new Date(Date.now() + delaySec * 1000) });
}

/** Mails are queued by user id. The worker decrypts the address at send time, it never sits in the queue. */
export const queueMail = (userId: string, template: string, data: Record<string, unknown> = {}) =>
  enqueue("mail", { userId, template, data });

export const queueWhatsApp = (userId: string, template: string, data: Record<string, unknown> = {}) =>
  enqueue("whatsapp", { userId, template, data });
