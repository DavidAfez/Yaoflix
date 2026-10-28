export const REASONS = ["spam", "harassment", "hate", "spoiler", "offtopic", "illegal", "other"] as const;
export type Reason = (typeof REASONS)[number];
