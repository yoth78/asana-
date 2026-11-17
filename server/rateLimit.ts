import type { Request, Response, NextFunction } from 'express';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

type Options = {
  windowMs: number;
  max: number;
  /** Prefix so different endpoints don't share counters. */
  name: string;
  /** Extra key material (e.g. email) — keep short. */
  keyFrom?: (req: Request) => string;
};

/** Simple in-memory rate limiter (per-process). Good enough for a single Render instance. */
export const rateLimit = (opts: Options) => {
  const { windowMs, max, name, keyFrom } = opts;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const extra = keyFrom ? keyFrom(req) : '';
    const key = `${name}:${ip}:${extra}`.toLowerCase();
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retrySec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retrySec));
      return res.status(429).json({
        error: 'Too many attempts. Please wait and try again.',
        retryAfterSeconds: retrySec
      });
    }

    next();
  };
};

/** Occasional cleanup so the Map does not grow forever. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();
