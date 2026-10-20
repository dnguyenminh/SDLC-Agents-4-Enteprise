/**
 * Pega insKey parsing helpers.
 * Extracted from PegaCrawler (BR-18) — pure functions; no behavior change.
 */

import type { PegaCrawlKey } from '../PegaCrawler.js';

export function parseInsKey(insKey: string): PegaCrawlKey | null {
  const cleanKey = insKey.split('#')[0].trim();
  const tokens = cleanKey.split(/\s+/);
  if (tokens.length < 2) return null;

  const pxObjClass = normalizeObjClass(tokens[0]);

  if (tokens.length >= 3) {
    return {
      insKey,
      pxObjClass,
      pyClassName: tokens[1],
      pyRuleName: tokens[2],
    };
  }

  return {
    insKey,
    pxObjClass,
    pyClassName: "@baseclass",
    pyRuleName: tokens[1],
  };
}

export function normalizeObjClass(raw: string): string {
  if (raw.startsWith('RULE-OBJ-')) {
    return 'Rule-' + raw.charAt(5).toUpperCase() + raw.substring(6).replace(/-/g, '-');
  }
  return raw;
}
