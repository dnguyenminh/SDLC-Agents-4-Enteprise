// KSA-286: Rate Limiting Middleware

import { Request, Response, NextFunction } from 'express';

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  read: { max: 100, windowMs: 60000 },
  write: { max: 30, windowMs: 60000 },
  search: { max: 20, windowMs: 60000 },
  import: { max: 5, windowMs: 3600000 },
};

const windows = new Map<string, { count: number; windowStart: number }>();

function getCategory(method: string, path: string): string {
  if (path.includes('/import') || path.includes('/export')) return 'import';
  if (path.includes('/search') || path.includes('/analytics')) return 'search';
  if (method === 'GET') return 'read';
  return 'write';
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as { userId: string }).userId;
  if (!userId) { next(); return; }

  const category = getCategory(req.method, req.path);
  const config = RATE_LIMITS[category];
  if (!config) { next(); return; }

  const key = `${userId}:${category}`;
  const now = Date.now();
  let window = windows.get(key);

  if (!window || now - window.windowStart > config.windowMs) {
    window = { count: 0, windowStart: now };
  }
  window.count++;
  windows.set(key, window);

  res.setHeader('X-RateLimit-Limit', config.max);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, config.max - window.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil((window.windowStart + config.windowMs) / 1000));

  if (window.count > config.max) {
    res.status(429).json({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } });
    return;
  }
  next();
}
