"use server";
import { getUser } from "@/lib/auth";
import { markTrophiesSeen } from "@/lib/trophies";
import { track } from "@/lib/engagement";

/** The celebration was shown: it won't come back. */
export async function trophiesSeen(ids: string[]) {
  const user = await getUser();
  if (!user) return;
  await markTrophiesSeen(user.id);
  for (const id of ids.slice(0, 30)) await track(user.id, "trophy", "shown", id);
}
