/**
 * npm run mail:test -- you@example.com
 * Checks the network step by step (proxy, name lookup, mail ports, HTTPS), then sends one test
 * mail, and says plainly what blocks.
 */
import { lookup } from "node:dns/promises";
import { connect } from "node:net";
import { mailRoute, sendMail } from "@/lib/notify/mailer";
import { useEnvProxy, windowsProxy } from "@/lib/net";

const to = process.argv[2];
if (!to?.includes("@")) {
  console.log("Usage : npm run mail:test -- ton@adresse.com");
  process.exit(1);
}

const ok = (s: string) => console.log(`  OK   ${s}`);
const ko = (s: string) => console.log(`  NON  ${s}`);
const port = (host: string, p: number) =>
  new Promise<boolean>((resolve) => {
    const s = connect({ host, port: p, timeout: 5000 });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("timeout", () => (s.destroy(), resolve(false)));
    s.once("error", () => resolve(false));
  });

const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
const sys = windowsProxy();
const proxy = useEnvProxy();
const smtpHost = (() => {
  try {
    return process.env.SMTP_URL ? new URL(process.env.SMTP_URL).hostname : "smtp.gmail.com";
  } catch {
    return "?";
  }
})();

console.log("\nRéseau");
envProxy ? ok(`HTTPS_PROXY dans .env : ${envProxy.replace(/\/\/[^@/]*@/, "//***@")}`) : ko("pas de HTTPS_PROXY dans .env");
if (process.platform === "win32") {
  sys.server ? ok(`proxy Windows : ${sys.server}${envProxy ? "" : " (utilisé)"}`) : ko("pas de proxy manuel dans Windows");
  if (sys.pac) console.log(`  INFO script de configuration automatique : ${sys.pac} (ouvre-le dans le navigateur : l'adresse du proxy y est écrite)`);
}
if (proxy) ok(`les requêtes sortent par ${proxy}`);
const ip = await lookup(smtpHost).then((r) => r.address, () => null);
ip ? ok(`${smtpHost} trouvé (${ip})`) : ko(`${smtpHost} introuvable sans proxy`);
if (ip) for (const p of [465, 587]) (await port(smtpHost, p)) ? ok(`port ${p} ouvert`) : ko(`port ${p} bloqué`);
const web = await fetch("https://api.brevo.com/v3/", { signal: AbortSignal.timeout(8000) }).then(() => true, () => false);
web ? ok("le web (port 443) passe : Brevo est joignable") : ko("le web (port 443) ne passe pas non plus depuis Node");

console.log("\nConfiguration");
console.log(`  SMTP_URL      ${process.env.SMTP_URL ? process.env.SMTP_URL.replace(/:[^:@/]*@/, ":***@") : "(vide)"}`);
console.log(`  BREVO_API_KEY ${process.env.BREVO_API_KEY ? "renseignée" : "(vide)"}`);
console.log(`  MAIL_FROM     ${process.env.MAIL_FROM || "(vide)"}`);

console.log(`\nEnvoi par : ${mailRoute()}`);
try {
  await sendMail({ to, subject: "Test GabaoFlix", text: "Si tu lis ceci, les mails partent.", html: "<p>Si tu lis ceci, les mails partent.</p>" });
  console.log(mailRoute() === "console" ? "Aucun envoi configuré (SMTP_URL ou BREVO_API_KEY) : le mail est affiché ci-dessus." : "Envoyé. Regarde ta boîte (et les spams).");
  process.exit(0);
} catch (e) {
  console.log(`Échec : ${e instanceof Error ? e.message : e}`);
  if (!ip && !web && !proxy) console.log("\nNode ne sort pas du tout sur ce réseau : il faut l'adresse du proxy dans HTTPS_PROXY (voir les lignes Réseau).");
  process.exit(1);
}
