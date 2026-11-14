/**
 * SA4E-84 — pre-write validation gate and error payload for the apply orchestrator.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDrawio, parseDrawioXml } from './drawio-parser';
import type { DiagramGraph } from './drawio-parser';
import { findMalformedTags, findXmlEscapingIssues } from './drawio-xml-sanitize';
import { snapDiagramToGrid, type SnapOptions } from './drawio-grid-snap';
import { applyDecisionLabels } from './drawio-decision-labels';
import { planEdges, applyEdgePlans } from './drawio-edge-plan';
import { placeLabels } from './drawio-label-place';
import { detectSequenceDiagram } from './drawio-detect-sequence';
import { detectUseCaseDiagram } from './drawio-detect-usecase';
import { atomicWriteFileSync } from './drawio-atomic-write';

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

/**
 * Final write gate for every fix strategy (SA4E-406 f): snap the produced XML
 * to the 10px grid, validate, write, and return the graph of what was written.
 * Every write path goes through HERE — no strategy writes the file directly.
 */
export function commitLayout(xml: string, filePath: string, opts?: SnapOptions): { graph: DiagramGraph } {
  // SA4E-406 (h): label unambiguous decision branches on the final geometry —
  // before the grid snap, so a second run sees settled, labeled edges.
  const labeled = applyDecisionLabels(xml, parseDrawioXml(xml));
  const snapped = snapDiagramToGrid(labeled, opts);
  // Routes were planned before the final grid snap. When the snap moved a
  // vertex, those routes are stale: re-plan them on the geometry that is
  // actually written. Sequence/use-case layouts keep their dedicated routes;
  // the ports-only path changes anchors, not the full route.
  const finalXml = replanMovedEdges(labeled, snapped, opts);
  validateReparse(finalXml);
  atomicWriteFileSync(filePath, finalXml);
  return { graph: parseDrawioXml(finalXml) };
}

/** Re-plan edge routes when the final grid snap moved the geometry. */
function replanMovedEdges(before: string, after: string, opts?: { portsOnly?: boolean }): string {
  if (before === after || opts?.portsOnly || hasSpecialLayout(after)) return after;
  return placeLabels(applyEdgePlans(after, planEdges(parseDrawioXml(after))));
}

/**
 * Final gate (SA4E-406 f/i): EVERY tool exit leaves the file on-grid with
 * unambiguous decision labels — including exits that bypass the strategies'
 * commitLayout (preflight/adopt rewrites, already_good, report-only, verify-loop
 * rollbacks). Write-only-when-changed keeps clean runs byte-identical.
 *
 * When the snap MOVED vertices, edge routes planned for the old geometry go
 * stale (crossings the router never saw), so they are re-planned on the final
 * geometry — except in sequence/use-case layouts, whose anchored message edges
 * and actor/boundary structure must not be re-routed.
 */
export function enforceFinalGate(filePath: string, opts?: SnapOptions): void {
  const before = fs.readFileSync(filePath, 'utf-8');
  // Forward the original request scope (portsOnly) so the final gate's grid snap
  // skips debunch/separateContainers on the ports path — node positions must be
  // preserved (FSD §3.1 L374). Only debunch/subtree-separation movement is
  // suppressed; on-grid alignment, mxfile-free output and re-parse validity are
  // still enforced.
  let after = snapDiagramToGrid(applyDecisionLabels(before, parseDrawioXml(before)), opts);
  if (after !== before && !hasSpecialLayout(after)) {
    after = placeLabels(applyEdgePlans(after, planEdges(parseDrawioXml(after))));
  }
  if (after === before) return;
  validateReparse(after);
  atomicWriteFileSync(filePath, after);
}

/** Sequence/use-case diagrams get dedicated layouts — never re-route their edges. */
function hasSpecialLayout(xml: string): boolean {
  const graph = parseDrawioXml(xml);
  return detectSequenceDiagram(graph).isSequence || detectUseCaseDiagram(graph) !== null;
}
