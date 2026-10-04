import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { paths } from "@/lib/storage";

/**
 * Speech to text through any OpenAI compatible Whisper endpoint.
 * Default: Groq (free tier, whisper-large-v3). Without TRANSCRIBE_API_KEY the job is skipped.
 */
export async function transcribe(feedbackId: string) {
  const key = process.env.TRANSCRIBE_API_KEY;
  if (!key) return;
  const url = process.env.TRANSCRIBE_API_URL || "https://api.groq.com/openai/v1/audio/transcriptions";
  const model = process.env.TRANSCRIBE_MODEL || "whisper-large-v3";

  const [fb] = await db.select().from(schema.feedback).where(eq(schema.feedback.id, feedbackId));
  if (!fb || fb.transcript) return;
  const audio = await readFile(paths.voice(fb.audioFile));

  const form = new FormData();
  form.set("file", new Blob([audio], { type: fb.mime }), fb.audioFile);
  form.set("model", model);
  form.set("language", "fr");
  form.set("response_format", "json");
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`Transcription ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { text } = (await res.json()) as { text?: string };
  await db.update(schema.feedback).set({ transcript: (text ?? "").trim() || null }).where(eq(schema.feedback.id, feedbackId));
}
