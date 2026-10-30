import { rejectLabels } from "../labels";
import type { RejectReason } from "@/db/schema";
import { makeT, type Locale } from "../i18n";

type Data = Record<string, unknown>;
type Mail = { subject: string; text: string; html: string };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Extra = { pre?: string; note?: string; showLink?: boolean };

const C = { ink: "#0b0b0d", card: "#131316", line: "#26262b", bone: "#f3f0e8", text: "#c9c6be", dim: "#8c8a84", lime: "#e2626b" };
const FONT = "'Archivo',Helvetica,Arial,sans-serif";

/**
 * The site in a mail: dark card, wordmark with its red dot, big tight title, one red button.
 * Tables and inline styles only, the way mail clients like it. Archivo where the client loads
 * web fonts (Apple Mail, iOS), Helvetica elsewhere.
 */
function layout(t: (s: string) => string, heading: string, body: string, cta?: { label: string; href: string }, x: Extra = {}) {
  const button = cta
    ? `<table cellpadding="0" cellspacing="0" role="presentation"><tr><td style="background:${C.lime}"><a href="${esc(cta.href)}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};text-decoration:none;letter-spacing:.01em">${esc(cta.label)}&nbsp;&nbsp;→</a></td></tr></table>`
    : "";
  const link =
    cta && x.showLink
      ? `<p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:${C.dim}">${esc(t("Le bouton ne marche pas ? Copie ce lien :"))}<br><a href="${esc(cta.href)}" style="color:${C.dim};word-break:break-all">${esc(cta.href)}</a></p>`
      : "";
  const note = x.note ? `<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid ${C.line};font-size:13px;line-height:1.6;color:${C.dim}">${x.note}</p>` : "";
  const home = process.env.APP_URL ?? "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@112,700;112,800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${C.ink};color:${C.bone};font-family:${FONT}">
${x.pre ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(x.pre)}</div>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.ink}"><tr><td align="center" style="padding:40px 16px">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px">
<tr><td style="padding:0 4px 24px;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-.02em;color:${C.bone}">GABAOFLIX<span style="color:${C.lime}">.</span></td></tr>
<tr><td style="background:${C.card};border-left:2px solid ${C.lime};padding:36px 32px">
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:32px;line-height:1.05;font-weight:800;letter-spacing:-.02em;color:${C.bone}">${heading}</h1>
${body ? `<p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:${C.text}">${body}</p>` : `<div style="height:12px"></div>`}
${button}${link}${note}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:11px;line-height:1.6;color:${C.dim}">${esc(t("Mail envoyé par GabaoFlix, cinéma entre amis."))}${home ? ` <a href="${esc(home)}" style="color:${C.dim}">${esc(home.replace(/^https?:\/\//, ""))}</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderMail(template: string, d: Data, locale: Locale = "fr"): Mail {
  const t = makeT(locale);
  const frame = (heading: string, body: string, cta?: { label: string; href: string }, x?: Extra) => layout(t, heading, body, cta, x);
  const reason = t(rejectLabels[d.reason as RejectReason] ?? "");
  switch (template) {
    case "verify":
      return {
        subject: t("Bienvenue sur GabaoFlix"),
        text: `${t("Bienvenue sur GabaoFlix.")}\n\n${t("Confirme ton adresse pour finir ton inscription : {link}", { link: String(d.link) })}\n\n${t("Ensuite, l'équipe valide ton compte et c'est parti. Le lien est valable 24 heures.")}`,
        html: frame(
          esc(t("Bienvenue.")),
          esc(t("Il reste une étape : confirme ton adresse. Ensuite, l'équipe valide ton compte et c'est parti.")),
          { label: t("Confirmer mon adresse"), href: String(d.link) },
          { pre: t("Confirme ton adresse pour finir ton inscription."), showLink: true, note: esc(t("Le lien est valable 24 heures. Tu n'as rien demandé ? Ignore ce mail, rien ne sera créé.")) },
        ),
      };
    case "reset":
      return {
        subject: t("Nouveau mot de passe"),
        text: `${t("Nouveau mot de passe")} : ${d.link}`,
        html: frame(esc(t("Nouveau mot de passe.")), esc(t("Choisis-en un nouveau avec le bouton ci-dessous.")), { label: t("Changer"), href: String(d.link) }, { showLink: true, note: esc(t("Lien valable 1 heure. Tu n'as rien demandé ? Ignore ce mail, ton mot de passe ne change pas.")) }),
      };
    case "ready":
      return {
        subject: t("{title} est prêt", { title: String(d.title) }),
        text: t("{title} est prêt. Ton lien privé, valable {days} jours : {link}", { title: String(d.title), days: String(d.days), link: String(d.link) }),
        html: frame(esc(t("{title} est prêt.", { title: String(d.title) })), esc(t("Lien privé, valable {days} jours.", { days: String(d.days) })), {
          label: t("Regarder"),
          href: String(d.link),
        }),
      };
    case "watchlist-ready":
      return {
        subject: t("{title} vient d'arriver", { title: String(d.title) }),
        text: t("{title} est dispo. Ton lien privé, valable {days} jours : {link}", { title: String(d.title), days: String(d.days), link: String(d.link) }),
        html: frame(esc(t("{title} vient d'arriver.", { title: String(d.title) })), esc(t("Lien privé, valable {days} jours.", { days: String(d.days) })), {
          label: t("Regarder"),
          href: String(d.link),
        }),
      };
    case "error":
      return {
        subject: t("Erreur {source} : {message}", { source: String(d.source), message: String(d.message).split("\n")[0].slice(0, 80) }),
        text: `${d.message}\n${d.where ? `${d.where}\n` : ""}${d.link}`,
        html: frame(esc(t("Nouvelle erreur.")), `<code style="font-size:13px;color:#f4f1ea">${esc(d.message)}</code>${d.where ? `<br><br>${esc(d.where)}` : ""}`, { label: t("Voir"), href: String(d.link) }),
      };
    case "new-title":
      return {
        subject: t("Nouveau sur GabaoFlix : {title}", { title: String(d.title) }),
        text: t("{title} vient d'arriver sur GabaoFlix : {link}", { title: String(d.title), link: String(d.link) }),
        html: frame(esc(t("{title} vient d'arriver.", { title: String(d.title) })), "", { label: t("Voir"), href: String(d.link) }),
      };
    case "creator":
      return {
        subject: t("Ton profil créateur est validé"),
        text: `${t("Ton profil créateur est validé")} : ${process.env.APP_URL ?? ""}/me/projects`,
        html: frame(t("Ton profil créateur est validé."), t("Tu peux mettre tes projets en ligne."), { label: t("Mes projets"), href: `${process.env.APP_URL ?? ""}/me/projects` }),
      };
    case "rejected":
      return {
        subject: t("{title} : pas pour l'instant", { title: String(d.title) }),
        text: `${d.title} : ${reason}`,
        html: frame(`${esc(d.title)}`, esc(reason), {
          label: t("Ma liste"),
          href: `${process.env.APP_URL ?? ""}/me`,
        }),
      };
    case "approved":
      return {
        subject: t("Ton compte est validé"),
        text: `${t("Ton compte est validé")} : ${process.env.APP_URL ?? ""}`,
        html: frame(esc(t("Tu es dedans.")), esc(t("Ton compte est validé. Demande un film, regarde-le, dis ce que t'en as pensé.")), { label: t("Entrer"), href: process.env.APP_URL ?? "/" }, { pre: t("Ton compte GabaoFlix est validé.") }),
      };
    default:
      throw new Error(`Unknown mail template ${template}`);
  }
}

/** Plain text for WhatsApp session messages (inside the 24h window) or as template parameters. */
export function renderWhatsApp(template: string, d: Data): { text: string; params: string[] } | null {
  switch (template) {
    case "ready":
    case "watchlist-ready":
      return { text: `🎬 ${d.title} est prêt.\n${d.link}`, params: [String(d.title), String(d.link)] };
    case "feedback":
      return {
        text: `Alors, ${d.title} ? Réponds ici avec une note vocale 🎙️`,
        params: [String(d.title)],
      };
    default:
      return null;
  }
}
