/** npm run mail:test -- you@example.com : sends one test mail and says plainly what went wrong. */
import { mailRoute, sendMail } from "@/lib/notify/mailer";
import { useEnvProxy } from "@/lib/net";

const to = process.argv[2];
if (!to?.includes("@")) {
  console.log("Usage : npm run mail:test -- ton@adresse.com");
  process.exit(1);
}
useEnvProxy();
console.log(`Envoi par : ${mailRoute()}`);
try {
  await sendMail({ to, subject: "Test GabaoFlix", text: "Si tu lis ceci, les mails partent.", html: "<p>Si tu lis ceci, les mails partent.</p>" });
  console.log(mailRoute() === "console" ? "Aucun envoi configuré (SMTP_URL ou BREVO_API_KEY) : le mail est affiché ci-dessus." : "Envoyé. Regarde ta boîte (et les spams).");
  process.exit(0);
} catch (e) {
  console.log(`Échec : ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
