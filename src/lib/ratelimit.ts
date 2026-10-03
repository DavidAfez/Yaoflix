type Bucket = { tokens: number; at: number };
const buckets = new Map<string, Bucket>();

/** In-memory token bucket. Enough for a single instance; swap for Redis when scaling out. */
export function rateLimit(key: string, capacity: number, perSeconds: number): boolean {
  const now = Date.now();
  const refill = capacity / (perSeconds * 1000);
  const b = buckets.get(key) ?? { tokens: capacity, at: now };
  b.tokens = Math.min(capacity, b.tokens + (now - b.at) * refill);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 50_000) buckets.clear();
  return true;
}
