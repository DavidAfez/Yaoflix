import type { Role } from "@/db/schema";

const rank: Record<Role, number> = { USER: 0, UPLOADER: 1, MODERATOR: 2, DEV: 3 };

export const can = {
  upload: (r: Role) => rank[r] >= rank.UPLOADER,
  handleRequests: (r: Role) => rank[r] >= rank.UPLOADER,
  viewErrors: (r: Role) => rank[r] >= rank.UPLOADER,
  resolveErrors: (r: Role) => rank[r] >= rank.MODERATOR,
  viewInsights: (r: Role) => rank[r] >= rank.MODERATOR,
  manageUsers: (r: Role) => rank[r] >= rank.MODERATOR,
  purgeErrors: (r: Role) => r === "DEV",
  /** Moderators can promote up to UPLOADER and never touch staff at their level or above. */
  setRole: (actor: Role, target: Role, next: Role) =>
    actor === "DEV" || (actor === "MODERATOR" && rank[target] < rank.MODERATOR && rank[next] < rank.MODERATOR),
  moderate: (actor: Role, target: Role) => actor === "DEV" || (actor === "MODERATOR" && rank[target] < rank.MODERATOR),
  isStaff: (r: Role) => rank[r] >= rank.UPLOADER,
};

export const roleLabel: Record<Role, string> = {
  USER: "Membre",
  UPLOADER: "Uploader",
  MODERATOR: "Modo",
  DEV: "Dev",
};
