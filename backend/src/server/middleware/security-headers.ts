/**
 * Security headers middleware.
 * Adds standard security headers to all responses.
 */

import type { MiddlewareHandler } from 'hono';

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();

  // Prevent MIME-type sniffing
  c.header('X-Content-Type-Options', 'nosniff');
  // Clickjacking protection — disabled for extension webview iframe embedding
  // X-Frame-Options removed: CSP frame-ancestors * handles this for local-only server
  // XSS filter (legacy browsers)
  c.header('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions policy
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Content Security Policy (defense-in-depth against XSS — vuln-0002/0003).
  // The admin SPA relies on inline scripts + Babel (eval) + CDN libs, so
  // script-src must allow those; object-src/base-uri/frame-ancestors are locked
  // down to block plugin, base-tag, and clickjacking vectors.
  c.header('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '));
  // Remove server identification
  c.res.headers.delete('X-Powered-By');
};