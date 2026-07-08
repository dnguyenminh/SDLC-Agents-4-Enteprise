/**
 * URL validation utilities for SSRF protection.
 * Blocks requests to private/internal IP ranges.
 *
 * Security: Finding #11 (SSRF via LLM Proxy)
 */

/** Private/internal IPv4 CIDR ranges that must be blocked. */
const BLOCKED_IPV4_RANGES = [
  { prefix: '10.', mask: 8 },
  { prefix: '127.', mask: 8 },
  { prefix: '169.254.', mask: 16 },
  { prefix: '192.168.', mask: 16 },
];

/** Check if an IPv4 address falls in 172.16.0.0/12 range. */
function isIn172Private(ip: string): boolean {
  const parts = ip.split('.');
  if (parts[0] !== '172') return false;
  const second = parseInt(parts[1], 10);
  return second >= 16 && second <= 31;
}

/** Check if an IP address is a private/internal address. */
function isPrivateIp(hostname: string): boolean {
  // IPv6 loopback and private
  if (hostname === '::1' || hostname === '[::1]') return true;
  if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true;

  // Strip brackets for IPv6
  const clean = hostname.replace(/^\[|\]$/g, '');

  // IPv4 simple prefix checks
  for (const range of BLOCKED_IPV4_RANGES) {
    if (clean.startsWith(range.prefix)) return true;
  }

  // 172.16-31.x.x
  if (isIn172Private(clean)) return true;

  // 0.0.0.0
  if (clean === '0.0.0.0') return true;

  return false;
}

/** Blocked hostnames that resolve to internal addresses. */
const BLOCKED_HOSTNAMES = ['localhost', 'localhost.localdomain'];

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a URL to prevent SSRF attacks.
 * Only allows http:// and https:// schemes.
 * Blocks private IP ranges and localhost aliases.
 */
export function validateExternalUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Only allow http/https schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: `Scheme '${parsed.protocol}' not allowed. Use http:// or https://` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known localhost aliases
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: 'Localhost URLs are not allowed for external connections' };
  }

  // Block private IP ranges
  if (isPrivateIp(hostname)) {
    return { valid: false, error: 'Private/internal IP addresses are not allowed' };
  }

  return { valid: true };
}
