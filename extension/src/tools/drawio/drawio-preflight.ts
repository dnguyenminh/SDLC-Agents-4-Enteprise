/**
 * SA4E-406 (M3/H1/M2) — the pre-parse gate of drawio_auto_layout:
 *   1. symlink guard (M2) — parent realpath must stay inside the workspace;
 *   2. byte cap (M3) — before the FIRST read, aligned with the proxy pre-read cap;
 *   3. cell pre-pass (M3) — cheap '<mxCell' count before any regex work;
 *   4. escaping repair + <mxfile> unwrap (i) — persisted before parsing;
 *   5. malformed-tag refusal — tags the tolerant parser would silently skip.
 */

import * as fs from 'fs';
import { checkSymlinkGuardForPath } from '../../backend-local-tools/fs-guards';
import { MAX_INPUT_BYTES, MAX_INPUT_CELLS } from './drawio-apply-args';
import { findMalformedTags, sanitizeDrawioXml } from './drawio-xml-sanitize';
import { unwrapMxfileXml } from './drawio-xml-utils';
import { validateReparse } from './drawio-apply-validate';
import { atomicWriteFileSync } from './drawio-atomic-write';

/** Gate outcome: the XML to parse, or an actionable error for the caller. */
export type Preflight = { xml: string } | { error: string };

/**
 * Run the whole pre-parse gate.
 * @param filePath      resolved, validated absolute path
 * @param workspaceRoot workspace root when the path was validated against one, else null
 * @param displayPath   sanitized path for logs/errors
 */
export function preflight(filePath: string, workspaceRoot: string | null, displayPath: string): Preflight {
  if (workspaceRoot) {
    const guard = checkSymlinkGuardForPath(filePath, workspaceRoot, displayPath);
    if (guard) return { error: guard };
  }
  let size = 0;
  try { size = fs.statSync(filePath).size; } catch { return { error: 'File not found or not accessible' }; }
  if (size > MAX_INPUT_BYTES) return { error: oversize(size) };
  const original = fs.readFileSync(filePath, 'utf-8');
  const cellCount = countCellTags(original);
  if (cellCount > MAX_INPUT_CELLS) return { error: tooManyCells(cellCount) };
  const { xml: cleaned, fixes } = sanitizeDrawioXml(original);
  const xml = unwrapMxfileXml(cleaned);
  const malformed = findMalformedTags(xml);
  if (malformed.length > 0) {
    const first = malformed[0];
    return { error:
      `draw.io syntax error: ${malformed.length} malformed <${first.tag}> tag(s); first at line ${first.line}: ` +
      `"${first.sample}". Fix the quoting in this file (it cannot be repaired automatically) and run again.` };
  }
  if (xml !== original) {
    validateReparse(xml);
    atomicWriteFileSync(filePath, xml);
    if (fixes.length > 0) console.warn(`[drawio-auto-layout] sanitized '${displayPath}' before layout — ${fixes.join('; ')}`);
  }
  return { xml };
}

/** Cheap non-regex '<mxCell' count — bounds the parse/sanitize work (M3). */
export function countCellTags(xml: string): number {
  let count = 0;
  for (let i = xml.indexOf('<mxCell'); i !== -1; i = xml.indexOf('<mxCell', i + 7)) count++;
  return count;
}

function mb(bytes: number): string { return `${Math.round(bytes / (1024 * 1024))} MB`; }

function oversize(size: number): string {
  return `File too large: ${mb(size)} (max ${mb(MAX_INPUT_BYTES)}). ` +
    'Split the diagram or remove unused pages, then run again.';
}

function tooManyCells(count: number): string {
  return `Diagram too complex: ~${count} cells (max ${MAX_INPUT_CELLS}). ` +
    'Split it into several .drawio files (one diagram per page) and lay them out separately.';
}
