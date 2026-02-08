import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/http';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
};

type RateState = {
  count: number;
  resetAt: number;
};

function getClientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

export function createRateLimiter(options: RateLimitOptions) {
  const storage = new Map<string, RateState>();
  const windowMs = options.windowMs;
  const max = options.max;

  if (process.env.NODE_ENV !== 'test') {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of storage.entries()) {
        if (value.resetAt <= now) {
          storage.delete(key);
        }
      }
    }, Math.min(windowMs, 60_000)).unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${getClientKey(req)}:${req.path}`;
    const now = Date.now();
    const current = storage.get(key);

    if (!current || current.resetAt <= now) {
      storage.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= max) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      return sendError(
        res,
        429,
        options.message || 'Too many requests. Please try again later.',
        { code: 'RATE_LIMITED' }
      );
    }

    current.count += 1;
    storage.set(key, current);
    return next();
  };
}
