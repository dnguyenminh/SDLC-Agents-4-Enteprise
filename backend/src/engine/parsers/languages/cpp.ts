/**
 * C++ regex symbol-extraction patterns (SA4E-225).
 * All patterns are anchored with `^` and run under the forced `m` flag (ReDoS-safe).
 * Control keywords are excluded via a linear negative lookahead to avoid false
 * positives (e.g. an `if` condition is not a free function).
 */

import type { PatternDef } from '../signature-extractor.js';

export const CPP_PATTERNS: PatternDef[] = [
  { regex: /^\s*(?:template\s*<[^>]*>\s*)?class\s+(\w+)/m, kind: 'class', nameGroup: 1 },
  { regex: /^\s*namespace\s+(\w+)/m, kind: 'namespace', nameGroup: 1 },
  { regex: /^\s*struct\s+(\w+)/m, kind: 'struct', nameGroup: 1 },
  { regex: /^\s*(?!if|for|while|switch|return|catch|do|else|delete|new|sizeof|throw|using|template|try|lock|assert)\w[\w:<>&*~]*\s+(\w+)\s*\(/m, kind: 'function', nameGroup: 1 },
  { regex: /^\s*enum\s+(?:\w+\s+)?(\w+)/m, kind: 'enum', nameGroup: 1 },
  { regex: /^\s*using\s+(\w+)\s*=/m, kind: 'type', nameGroup: 1 },
];
