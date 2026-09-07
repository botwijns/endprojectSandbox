// Tiny fixed-window rate limiter. Keys are held in memory only for the length
// of one window and are never persisted or logged — this keeps the "no stored
// IP / PII" guarantee while still blocking obvious spam on the write endpoints.

const WINDOW_MS = 60_000;

export function createRateLimiter(perMinute) {
  const limit = Number.isFinite(perMinute) && perMinute > 0 ? perMinute : 120;
  let windowStart = Date.now();
  let counts = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now;
      counts = new Map();
    }
    const key = req.ip || 'unknown';
    const used = (counts.get(key) || 0) + 1;
    counts.set(key, used);

    if (used > limit) {
      res.setHeader('Retry-After', Math.ceil((windowStart + WINDOW_MS - now) / 1000));
      return res.status(429).json({ error: 'rate_limited', message: 'Too many requests, slow down.' });
    }
    next();
  };
}
