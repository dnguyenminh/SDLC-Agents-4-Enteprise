/**
 * SA4E-84 — pre-write validation gate and error payload for the apply orchestrator.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDrawio } from './drawio-parser';
import { findMalformedTags, findXmlEscapingIssues } from './drawio-xml-sanitize';

/** BR-7: Re-parse fixed XML to ensure it's valid before writing to file. */
export function validateReparse(xml: string): void {
  // SA4E-406 UAT: draw.io syntax gate — attribute values must not carry raw
  // '<' or bare '&' (draw.io: "Unescaped '<' not allowed in attributes values").
  // The regex parser accepts them, so this check lives HERE, before the write.
  const escaping = findXmlEscapingIssues(xml);
  if (escaping.length > 0) {
    const first = escaping[0];
    throw new Error(
      `drawio syntax validation failed: unescaped '${first.kind === 'raw_lt' ? '<' : '&'}' in @${first.attribute}` +
      ` ("${first.sample}") — ${escaping.length} attribute(s) affected`,
    );
  }
  const malformed = findMalformedTags(xml);
  if (malformed.length > 0) {
    throw new Error(`drawio syntax validation failed: malformed <${malformed[0].tag}> at line ${malformed[0].line} ("${malformed[0].sample}")`);
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-fix-'));
  try {
    const tmpFile = path.join(tmpDir, 'fixed.drawio');
    fs.writeFileSync(tmpFile, xml, 'utf-8');
    parseDrawio(tmpFile); // Throws if XML is broken
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupErr: unknown) {
      console.error('[drawio-apply] Temp cleanup failed:', cleanupErr);
    }
  }
}

/** JSON error payload returned to the MCP caller. */
export function error(msg: string): string {
  return JSON.stringify({ error: msg });
}
