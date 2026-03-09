// Simple in-memory rate limiter
// Usage: const limiter = createRateLimiter(maxRequests, windowMs)
// In handler: const { limited, remaining } = limiter.check(key)

interface RateLimitResult {
  limited: boolean;
  remaining: number;
}

interface RateLimiterEntry {
  timestamps: number[];
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const entries = new Map<string, RateLimiterEntry>();

  // Clean up stale entries every 60 seconds
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        entries.delete(key);
      }
    }
  }, 60_000);

  // Allow the timer to not block process exit
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      let entry = entries.get(key);

      if (!entry) {
        entry = { timestamps: [] };
        entries.set(key, entry);
      }

      // Remove timestamps outside the current window
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

      if (entry.timestamps.length >= maxRequests) {
        return {
          limited: true,
          remaining: 0,
        };
      }

      entry.timestamps.push(now);

      return {
        limited: false,
        remaining: maxRequests - entry.timestamps.length,
      };
    },
  };
}

/**
 * Extract the client IP address from request headers.
 * Checks x-forwarded-for, x-real-ip, then falls back to "unknown".
 */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; take the first entry
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "unknown";
}
