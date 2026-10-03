import { sql, eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { logError } from "@/lib/errors";
import { renderMail, renderWhatsApp } from "@/lib/notify/templates";
import { sendWhatsApp, whatsappEnabled } from "@/lib/notify/whatsapp";
import { transcode } from "./transcode";

type Job = typeof schema.jobs.$inferSelect;

const MAX_ATTEMPTS = 5;
const mailer = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

/** Atomically claims the next due job of the given types. SKIP LOCKED lets several workers run side by side. */
async function claim(types: string[]): Promise<Job | null> {
  const res = await db.execute(sql`
    update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
    where id = (
      select id from jobs
      where status = 'queued' and run_at <= now() and type in (${sql.join(types.map((t) => sql`${t}`), sql`, `)})
      order by run_at
      for update skip locked
      limit 1
    )
    returning *`);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as number,
    type: row.type as string,
    payload: row.payload as Record<string, unknown>,
    status: row.status as string,
    attempts: row.attempts as number,
    runAt: row.run_at as Date,
    lockedAt: row.locked_at as Date,
    lastError: row.last_error as string | null,
    createdAt: row.created_at as Date,
  };
}

async function contact(userId: string) {
  const [u] = await db
    .select({ emailEnc: schema.users.emailEnc, phoneEnc: schema.users.phoneEnc, wa: schema.users.whatsappOptIn, banned: schema.users.bannedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return u;
}

async function handle(job: Job) {
  const p = job.payload;
  switch (job.type) {
    case "transcode":
      return transcode(String(p.mediaId));
    case "mail": {
      const u = await contact(String(p.userId));
      if (!u || u.banned) return;
      const mail = renderMail(String(p.template), (p.data ?? {}) as Record<string, unknown>);
      const to = decrypt(u.emailEnc);
      if (!mailer) {
        const masked = to.replace(/^(.).*(@.*)$/, "$1***$2");
        console.log(`\n[mail] to ${masked}\n  ${mail.subject}\n  ${mail.text}\n`);
        return;
      }
      await mailer.sendMail({ from: process.env.MAIL_FROM, to, subject: mail.subject, text: mail.text, html: mail.html });
      return;
    }
    case "whatsapp": {
      if (!whatsappEnabled()) return;
      const u = await contact(String(p.userId));
      if (!u?.phoneEnc || !u.wa || u.banned) return;
      const msg = renderWhatsApp(String(p.template), (p.data ?? {}) as Record<string, unknown>);
      if (msg) await sendWhatsApp(decrypt(u.phoneEnc), String(p.template), msg);
      return;
    }
    default:
      throw new Error(`Unknown job type ${job.type}`);
  }
}

async function finish(job: Job, error?: unknown) {
  if (!error) {
    // Payloads may hold private links: scrub them once delivered
    await db.update(schema.jobs).set({ status: "done", payload: {}, lockedAt: null }).where(eq(schema.jobs.id, job.id));
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  const failed = job.attempts >= MAX_ATTEMPTS || job.type === "transcode";
  await db
    .update(schema.jobs)
    .set({
      status: failed ? "failed" : "queued",
      lastError: message.slice(0, 2000),
      lockedAt: null,
      runAt: new Date(Date.now() + 2 ** job.attempts * 30_000),
    })
    .where(eq(schema.jobs.id, job.id));
  if (job.type === "transcode") {
    await db
      .update(schema.media)
      .set({ status: "FAILED", error: message.slice(0, 1000) })
      .where(eq(schema.media.id, String(job.payload.mediaId)));
  }
  const source = job.type === "mail" ? "mail" : job.type === "whatsapp" ? "whatsapp" : "worker";
  await logError(source, error, { job: job.type, jobId: job.id, attempt: job.attempts });
}

/** Jobs stuck in "running" after a crash go back to the queue. */
async function recoverStale() {
  await db.execute(sql`
    update jobs set status = 'queued', locked_at = null
    where status = 'running' and (
      (type = 'transcode' and locked_at < now() - interval '12 hours') or
      (type <> 'transcode' and locked_at < now() - interval '10 minutes')
    )`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stopping = false;

async function lane(name: string, types: string[]) {
  while (!stopping) {
    const job = await claim(types).catch(async (e) => {
      await logError("worker", e, { lane: name });
      return null;
    });
    if (!job) {
      await sleep(1500);
      continue;
    }
    const t0 = Date.now();
    try {
      await handle(job);
      await finish(job);
      console.log(`[${name}] ${job.type} #${job.id} ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
      console.error(`[${name}] ${job.type} #${job.id} failed`, e);
      await finish(job, e);
    }
  }
}

async function main() {
  console.log("Yaoflix worker up");
  await recoverStale();
  setInterval(() => void recoverStale().catch(() => {}), 5 * 60_000);
  const heavy = Number(process.env.TRANSCODE_CONCURRENCY ?? 1);
  await Promise.all([
    ...Array.from({ length: heavy }, (_, i) => lane(`transcode-${i}`, ["transcode"])),
    lane("notify", ["mail", "whatsapp"]),
  ]);
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopping = true;
    setTimeout(() => process.exit(0), 2000);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
