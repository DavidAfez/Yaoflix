import type { PostMedia } from "@/db/schema";

/** What travels inside a sealed message. The server only ever sees the ciphertext. */
export type Payload = {
  t?: string;
  gif?: Extract<PostMedia, { type: "gif" }>;
  img?: { id: string; iv: string; mime: string };
  post?: string;
};
export type Msg = { id: string; mine: boolean; iv: string; body: string; at: string };
export type Thread = { id: string; other: { id: string; handle: string; avatarId: string | null; publicKey: string | null }; lastAt: string; unread: boolean };
