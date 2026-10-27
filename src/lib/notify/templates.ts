import { rejectLabels } from "../labels";
import type { RejectReason } from "@/db/schema";
import { makeT, type Locale } from "../i18n";

type Data = Record<string, unknown>;
type Mail = { subject: string; text: string; html: string };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function frame(heading: string, body: string, cta?: { label: string; href: string }) {
  const button = cta
    ? `<a href="${esc(cta.href)}" style="display:inline-block;background:#e2626b;color:#0a0a0c;padding:14px 26px;font-weight:700;text-decoration:none;letter-spacing:.02em">${esc(cta.label)}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#0a0a0c;color:#f4f1ea;font-family:Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:48px 20px">
<table width="100%" style="max-width:520px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;letter-spacing:.3em;color:#e2626b;font-weight:700;padding-bottom:36px">GABAOFLIX</td></tr>
<tr><td style="font-size:30px;line-height:1.1;font-weight:800;padding-bottom:20px">${heading}</td></tr>
<tr><td style="font-size:16px;line-height:1.6;color:#d8d4cb;padding-bottom:32px">${body}</td></tr>
<tr><td>${button}</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderMail(template: string, d: Data, locale: Locale = "fr"): Mail {
  const t = makeT(locale);
  const reason = t(rejectLabels[d.reason as RejectReason] ?? "");
  switch (template) {
    case "verify":
      return {
        subject: t("Confirme ton adresse"),
        text: `${t("Confirme ton adresse")} : ${d.link}`,
        html: frame(t("Un clic et c'est bon."), "", { label: t("Confirmer"), href: String(d.link) }),
      };
    case "reset":
      return {
        subject: t("Nouveau mot de passe"),
        text: `${t("Nouveau mot de passe")} : ${d.link}`,
        html: frame(t("Nouveau mot de passe."), t("Lien valable 1 heure."), { label: t("Changer"), href: String(d.link) }),
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
        subject: t("Bienvenue sur GabaoFlix"),
        text: `${t("Ton compte est validé")} : ${process.env.APP_URL ?? ""}`,
        html: frame(t("Tu es dedans."), "", { label: t("Entrer"), href: process.env.APP_URL ?? "/" }),
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
