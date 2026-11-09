/**
 * SA4E-84 — draw.io layout issue detectors (extracted from drawio-tool.ts for
 * the SA4E-223 line-count gate; SA4E-394 keeps the file under 200 lines when
 * base_dir support is added). Detects node overlaps, edge crossings, and
 * diagonal edges. Re-exported from drawio-tool.ts for backward compatibility.
 */

import { DiagramGraph, DiagramNode } from './drawio-parser';
import type { LayoutIssue } from './drawio-detect';

export { type LayoutIssue } from './drawio-detect';
export { detectAllIssues } from './drawio-detect';
