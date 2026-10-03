const GRAPH = "https://graph.facebook.com/v21.0";

export const whatsappEnabled = () => Boolean(process.env.WA_PHONE_NUMBER_ID && process.env.WA_ACCESS_TOKEN);

function templateFor(kind: string): string | undefined {
  if (kind === "ready" || kind === "watchlist-ready") return process.env.WA_TEMPLATE_READY || undefined;
  if (kind === "feedback") return process.env.WA_TEMPLATE_FEEDBACK || undefined;
}

/**
 * Business initiated messages need an approved template.
 * When none is configured we send a plain text message, which Meta only delivers inside the 24h window.
 */
export async function sendWhatsApp(to: string, kind: string, msg: { text: string; params: string[] }) {
  const tpl = templateFor(kind);
  const body = tpl
    ? {
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: tpl,
          language: { code: "fr" },
          components: [{ type: "body", parameters: msg.params.map((text) => ({ type: "text", text })) }],
        },
      }
    : { messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body: msg.text } };
  const res = await fetch(`${GRAPH}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<{ data: Buffer; mime: string }> {
  const auth = { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth });
  if (!meta.ok) throw new Error(`WhatsApp media meta ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: auth });
  if (!file.ok) throw new Error(`WhatsApp media ${file.status}`);
  return { data: Buffer.from(await file.arrayBuffer()), mime: mime_type };
}
