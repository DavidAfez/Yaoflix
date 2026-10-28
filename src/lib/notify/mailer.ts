import nodemailer from "nodemailer";

export type Outgoing = { to: string; subject: string; text: string; html: string };

const proxy = () => process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "";

/**
 * How mails leave:
 * - BREVO_API_KEY: Brevo's HTTPS API, port 443, through the same proxy as TMDB. Works on
 *   networks that block mail ports or outside name lookups.
 * - SMTP_URL: classic SMTP, through HTTPS_PROXY when one is set (HTTP CONNECT).
 * - neither: printed in the worker console (dev).
 */
export function mailMode(): "brevo" | "smtp" | "console" {
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.SMTP_URL) return "smtp";
  return "console";
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function smtp() {
  // nodemailer reads the connection url and routes the socket through the proxy itself
  transport ??= nodemailer.createTransport({ url: process.env.SMTP_URL, ...(proxy() ? { proxy: proxy() } : {}) } as never);
  return transport;
}

/** "GabaoFlix <no-reply@x.fr>" → { name, email } */
function sender() {
  const from = process.env.MAIL_FROM ?? "";
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || "GabaoFlix", email: m[2] } : { name: "GabaoFlix", email: from.trim() };
}

/** Network errors get a hint in plain words: the raw code alone says little. */
function explain(e: unknown): Error {
  const err = e instanceof Error ? e : new Error(String(e));
  // "fetch failed" keeps the real reason in its cause
  const cause = err.cause instanceof Error ? err.cause : null;
  const text = cause ? `${err.message} (${cause.message})` : err.message;
  // nodemailer files DNS failures under its own code (EDNS): look at every code in sight
  const codes = new Set([(err as Error & { code?: string }).code, (cause as (Error & { code?: string }) | null)?.code, ...(text.match(/\bE[A-Z_]{3,}\b/g) ?? [])]);
  const has = (...c: string[]) => c.some((x) => codes.has(x));
  const hint =
    has("ENOTFOUND", "EAI_AGAIN", "EDNS")
      ? "le réseau ne trouve pas le serveur mail (réseau d'entreprise ?) : renseigne HTTPS_PROXY, ou passe par BREVO_API_KEY"
      : has("ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ESOCKET", "ECONNECTION") || /proxy/i.test(text)
        ? "le port mail est bloqué ou le proxy refuse : passe par BREVO_API_KEY (port 443)"
        : has("EAUTH") || /Invalid login|Username and Password not accepted/i.test(text)
          ? "identifiants refusés : pour Gmail, il faut un mot de passe d'application (et %40 à la place du @ dans SMTP_URL)"
          : "";
  // A new error: the mail library's own ones don't take a new message
  const out = new Error(hint ? `${text} → ${hint}` : text);
  out.stack = `${out.message}\n${err.stack?.split("\n").slice(1).join("\n") ?? ""}`;
  return out;
}

export async function sendMail(m: Outgoing) {
  const mode = mailMode();
  try {
    if (mode === "brevo") {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: sender(), to: [{ email: m.to }], subject: m.subject, textContent: m.text, htmlContent: m.html }),
      });
      if (!res.ok) throw new Error(`Brevo ${res.status} : ${(await res.text()).slice(0, 300)}`);
      return;
    }
    if (mode === "smtp") {
      await smtp().sendMail({ from: process.env.MAIL_FROM, to: m.to, subject: m.subject, text: m.text, html: m.html });
      return;
    }
    const masked = m.to.replace(/^(.).*(@.*)$/, "$1***$2");
    console.log(`\n[mail] to ${masked}\n  ${m.subject}\n  ${m.text}\n`);
  } catch (e) {
    throw explain(e);
  }
}

export const mailRoute = () => `${mailMode()}${mailMode() === "smtp" && proxy() ? " via proxy" : ""}`;
