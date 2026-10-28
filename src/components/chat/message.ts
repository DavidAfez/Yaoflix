import type { PostMedia } from "@/db/schema";
import type { PublicDevice } from "@/lib/e2e";

/** What travels inside a sealed message. The server only ever sees the ciphertext. */
export type Payload = {
  t?: string;
  gif?: Extract<PostMedia, { type: "gif" }>;
  // k: the attachment's own key, readable only inside this encrypted payload
  img?: { id: string; iv: string; k: string; mime: string };
  post?: string;
};
export type Msg = { id: string; mine: boolean; iv: string; body: string; at: string; key: { wrap: string; from: PublicDevice } | null };
export type Thread = { id: string; other: { id: string; handle: string; avatarId: string | null; ready: boolean }; lastAt: string; unread: boolean };
