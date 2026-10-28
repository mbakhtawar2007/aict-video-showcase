// Phase 1 — simple in-memory rate limiter for /api/auth/request-code.
//
// Scope: one process only. This is the local-build limiter the spec's
// Phase 1 calls for (per-email and per-IP). It is NOT a production
// guarantee across serverless instances: on live Vercel, replace or
// supplement it with Upstash Redis (env-gated, see PHASE1-REPORT.md)
// and keep Supabase's built-in auth rate limits enabled as the
// second layer. Turnstile is likewise env-gated for live only; no
// Turnstile or Upstash key exists in this repo.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (existing.count < limit) {
    existing.count += 1;
    return { allowed: true };
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

// Defaults used by request-code: 5 attempts per email per 15 minutes,
// 20 attempts per IP per 15 minutes. Tune via env only on live.
export const REQUEST_CODE_LIMITS = {
  perEmail: { limit: 5, windowMs: 15 * 60 * 1000 },
  perIp: { limit: 20, windowMs: 15 * 60 * 1000 },
  // Resend cooldown is enforced by the UI and by Supabase; this
  // process-level guard is deliberately not stricter than the above.
} as const;

/** Test helper: clears all buckets. Not used by route handlers. */
export function clearRateLimits(): void {
  buckets.clear();
}
