/**
 * SA4E-410 (DISC-3) — Shared utilities for draw.io flattening.
 */

const AMP = String.fromCharCode(38) + 'amp;';
const LT = String.fromCharCode(38) + 'lt;';
const GT = String.fromCharCode(38) + 'gt;';
const QUOT = String.fromCharCode(38) + 'quot;';

export function parseAttrs(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) out[m[1]] = m[2];
  return out;
}

export function serializeAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(' ');
}

/** Escape a value for use inside a double-quoted XML attribute. */
export function escapeAttr(v: string): string {
  return v
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)
    .replace(/"/g, QUOT);
}

export { AMP, LT, GT, QUOT };