import { rejectLabels } from "../labels";
import type { RejectReason } from "@/db/schema";

type Data = Record<string, unknown>;
type Mail = { subject: string; text: string; html: string };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function frame(heading: string, body: string, cta?: { label: string; href: string }) {
  const button = cta
    ? `<a href="${esc(cta.href)}" style="display:inline-block;background:#c6ff3d;color:#0a0a0c;padding:14px 26px;font-weight:700;text-decoration:none;letter-spacing:.02em">${esc(cta.label)}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#0a0a0c;color:#f4f1ea;font-family:Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:48px 20px">
<table width="100%" style="max-width:520px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;letter-spacing:.3em;color:#c6ff3d;font-weight:700;padding-bottom:36px">YAOFLIX</td></tr>
<tr><td style="font-size:30px;line-height:1.1;font-weight:800;padding-bottom:20px">${heading}</td></tr>
<tr><td style="font-size:16px;line-height:1.6;color:#d8d4cb;padding-bottom:32px">${body}</td></tr>
<tr><td>${button}</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderMail(template: string, d: Data): Mail {
  switch (template) {
    case "verify":
      return {
        subject: "Confirme ton adresse",
        text: `Confirme ton adresse : ${d.link}`,
        html: frame("Un clic et c'est bon.", "", { label: "Confirmer", href: String(d.link) }),
      };
    case "reset":
      return {
        subject: "Nouveau mot de passe",
        text: `Nouveau mot de passe : ${d.link}`,
        html: frame("Nouveau mot de passe.", "Lien valable 1 heure.", { label: "Changer", href: String(d.link) }),
      };
    case "ready":
      return {
        subject: `${d.title} est prêt`,
        text: `${d.title} est prêt. Ton lien privé, valable ${d.days} jours : ${d.link}`,
        html: frame(`${esc(d.title)} est prêt.`, `Lien privé, valable ${esc(d.days)} jours.`, {
          label: "Regarder",
          href: String(d.link),
        }),
      };
    case "watchlist-ready":
      return {
        subject: `${d.title} vient d'arriver`,
        text: `${d.title} est dispo. Ton lien privé, valable ${d.days} jours : ${d.link}`,
        html: frame(`${esc(d.title)} vient d'arriver.`, `Lien privé, valable ${esc(d.days)} jours.`, {
          label: "Regarder",
          href: String(d.link),
        }),
      };
    case "rejected":
      return {
        subject: `${d.title} : pas pour l'instant`,
        text: `${d.title} : ${rejectLabels[d.reason as RejectReason] ?? ""}`,
        html: frame(`${esc(d.title)}`, esc(rejectLabels[d.reason as RejectReason] ?? ""), {
          label: "Ma liste",
          href: `${process.env.APP_URL ?? ""}/me`,
        }),
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
