import crypto from 'crypto';

export function normalizeUserAgent(ua: string): string {
  if (!ua) return '';
  return ua.trim().toLowerCase();
}

export function hashUserAgent(ua: string): string {
  const normalized = normalizeUserAgent(ua);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
