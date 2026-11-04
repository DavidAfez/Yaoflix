"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { mayUpload } from "@/lib/creators";
import { can } from "@/lib/rbac";

const note = z.object({
  kind: z.enum(["fact", "song"]),
  body: z.string().trim().min(1).max(500),
  artist: z.string().trim().max(120).nullable().optional(),
  atSec: z.number().int().min(0).max(24 * 3600).nullable().optional(),
});

/** Fun facts and songs, added by staff or by the creator of the project. */
export async function addNotes(titleId: number, items: z.input<typeof note>[]): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!Number.isInteger(titleId) || !(await mayUpload(user, titleId))) return { ok: false, error: "Interdit" };
  const parsed = z.array(note).max(40).safeParse(items);
  if (!parsed.success) return { ok: false, error: "Invalide" };
  if (!parsed.data.length) return { ok: true };
  await db.insert(schema.titleNotes).values(
    parsed.data.map((n) => ({ titleId, kind: n.kind, body: n.body, artist: n.kind === "song" ? (n.artist ?? null) : null, atSec: n.kind === "song" ? (n.atSec ?? null) : null, authorId: user.id })),
  );
  revalidatePath("/t", "layout");
  return { ok: true };
}

/** Its author or staff can take a note down. */
export async function deleteNote(id: number) {
  const user = await requireUser();
  const [n] = await db.select({ authorId: schema.titleNotes.authorId }).from(schema.titleNotes).where(eq(schema.titleNotes.id, id));
  if (!n || (n.authorId !== user.id && !can.upload(user.role))) return;
  await db.delete(schema.titleNotes).where(and(eq(schema.titleNotes.id, id)));
  revalidatePath("/t", "layout");
}
