import { NextResponse } from "next/server";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { blockedBetween, threadFor } from "@/lib/chat";
import { rateLimit } from "@/lib/ratelimit";

/** Ciphertexts of a thread. ?after=<iso> returns only the newer ones (polling). Reading marks the thread read. */
export async function GET(req: Request, ctx: RouteContext<"/api/chat/threads/[id]/messages">) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const t = await threadFor(user.id, (await ctx.params).id);
  if (!t) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const after = new URL(req.url).searchParams.get("after");
  const rows = after
    ? await db.select().from(schema.chatMessages).where(and(eq(schema.chatMessages.threadId, t.id), gt(schema.chatMessages.createdAt, new Date(after)))).orderBy(asc(schema.chatMessages.createdAt)).limit(200)
    : (await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.threadId, t.id)).orderBy(desc(schema.chatMessages.createdAt)).limit(150)).reverse();
  await db
    .insert(schema.chatReads)
    .values({ threadId: t.id, userId: user.id })
    .onConflictDoUpdate({ target: [schema.chatReads.threadId, schema.chatReads.userId], set: { at: new Date() } });
  return NextResponse.json({ messages: rows.map((m) => ({ id: m.id, mine: m.senderId === user.id, iv: m.iv, body: m.body, at: m.createdAt.toISOString() })) });
}

const body = z.object({ iv: z.string().max(32), body: z.string().min(1).max(64_000) });

export async function POST(req: Request, ctx: RouteContext<"/api/chat/threads/[id]/messages">) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  if (!rateLimit(`msg:${user.id}`, 30, 30)) return NextResponse.json({ error: "Doucement, réessaie dans une minute." }, { status: 429 });
  const t = await threadFor(user.id, (await ctx.params).id);
  if (!t) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (await blockedBetween(t.a, t.b)) return NextResponse.json({ error: "Impossible d'écrire à ce membre" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  const [m] = await db.insert(schema.chatMessages).values({ threadId: t.id, senderId: user.id, ...parsed.data }).returning();
  await db.update(schema.chatThreads).set({ lastAt: new Date() }).where(eq(schema.chatThreads.id, t.id));
  return NextResponse.json({ id: m.id, mine: true, iv: m.iv, body: m.body, at: m.createdAt.toISOString() });
}
