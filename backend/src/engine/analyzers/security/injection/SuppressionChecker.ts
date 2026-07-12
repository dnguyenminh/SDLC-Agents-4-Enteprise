/**
 * KSA-165: Suppression Checker — Detects nosec/NOLINT markers to suppress findings.
 */

import type { SuppressionInfo } from '../types/index.js';

interface SuppressionMarker {
  pattern: string;
  scope: 'line' | 'block' | 'file';
}

const DEFAULT_MARKERS: SuppressionMarker[] = [
  { pattern: '// nosec', scope: 'line' },
  { pattern: '# nosec', scope: 'line' },
  { pattern: '// NOLINT', scope: 'line' },
  { pattern: '/* NOLINT */', scope: 'line' },
  { pattern: '// @security-ignore', scope: 'line' },
  { pattern: '# @security-ignore', scope: 'line' },
  { pattern: '// nosec:block', scope: 'block' },
  { pattern: '// @security-ignore-file', scope: 'file' },
];

export class SuppressionChecker {
  private markers: SuppressionMarker[];

  constructor(markers?: SuppressionMarker[]) {
    this.markers = markers ?? DEFAULT_MARKERS;
  }

  /** Check if a specific line in source code has a suppression marker. */
  isSuppressed(sourceLines: string[], line: number): SuppressionInfo | null {
    const lineIdx = line - 1;
    if (lineIdx < 0 || lineIdx >= sourceLines.length) return null;

    const lineText = sourceLines[lineIdx];
    const prevLineText = lineIdx > 0 ? sourceLines[lineIdx - 1] : '';

    for (const marker of this.markers) {
      // Check current line (inline comment)
      if (lineText.includes(marker.pattern)) {
        return { marker: marker.pattern, scope: marker.scope, line };
      }
      // Check previous line (comment above)
      if (prevLineText.includes(marker.pattern)) {
        return { marker: marker.pattern, scope: marker.scope, line: line - 1 };
      }
    }

    return null;
  }

  /** Check if entire file is suppressed. */
  isFileSuppressed(sourceLines: string[]): boolean {
    // Check first 5 lines for file-level suppression
    const headerLines = sourceLines.slice(0, 5);
    for (const line of headerLines) {
      for (const marker of this.markers) {
        if (marker.scope === 'file' && line.includes(marker.pattern)) {
          return true;
        }
      }
    }
    return false;
  }
}