export const REASONS = ["spam", "harassment", "hate", "spoiler", "illegal", "other"] as const;
export type Reason = (typeof REASONS)[number];
