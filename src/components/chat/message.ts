import type { PostMedia, TierItem, TitleRef } from "@/db/schema";
import type { PublicDevice } from "@/lib/e2e";
import type { PollData } from "../post-kinds";

// k: an image's own key, readable only inside the encrypted payload
export type Attachment = { type: "img"; id: string; iv: string; k: string; mime: string } | Extract<PostMedia, { type: "gif" }>;
export type Rich =
  | { kind: "top5"; data: { title: string; items: TitleRef[] } }
  | { kind: "tier"; data: { title: string; tiers: { label: string; items: TierItem[] }[] } }
  | { kind: "poll"; data: PollData };

/** What travels inside a sealed message. The server only ever sees the ciphertext. */
export type Payload = {
  t?: string;
  media?: Attachment[];
  title?: TitleRef;
  rich?: Rich;
  post?: string;
  // A vote on a poll sent in this conversation: tallied on the devices, hidden from the thread
  vote?: { of: string; option: number };
  // First version of the chat: one attachment per message
  gif?: Extract<PostMedia, { type: "gif" }>;
  img?: { id: string; iv: string; k: string; mime: string };
};
export type Msg = { id: string; mine: boolean; iv: string; body: string; at: string; key: { wrap: string; from: PublicDevice } | null };
export type Thread = { id: string; other: { id: string; handle: string; avatarId: string | null; ready: boolean }; lastAt: string; unread: boolean };
