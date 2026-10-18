/**
 * Fence-aware splitting of streamed assistant text into COMPLETED blocks.
 * Extracted verbatim from turn-budget-guard.ts (BR-18 file-size split).
 */
import { MAX_TEXT_SCAN_CHARS } from './budget-types.js';

/**
 * Split streamed assistant text into COMPLETED blocks only.
 * Fence-aware: lines inside an unclosed fence are never blocks, and a fence
 * becomes a block the moment it closes. A trailing unterminated block is
 * partial (still streaming) and excluded — callers diff by count, so the
 * returned array only ever grows by append.
 */
export function splitCompletedBlocks(text: string): string[] {
  if (!text || text.length > MAX_TEXT_SCAN_CHARS) return [];
  const lines = text.split('\n');
  const blocks: string[] = [];
  let cur: string[] = [];
  let inFence = false;
  const flush = () => {
    const block = cur.join('\n');
    cur = [];
    if (block.trim()) blocks.push(block);
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      cur.push(line);
      inFence = !inFence;
      if (!inFence) flush(); // closed fence = atomic completed block
      continue;
    }
    if (!inFence && trimmed === '') {
      flush();
      continue;
    }
    cur.push(line);
  }
  // Trailing cur without terminator is partial — intentionally dropped.
  return blocks;
}
