/**
 * search-parser — MCP tool output parsing into search candidates.
 * Extracted from search-provider.ts (BR-18); line grammar unchanged
 * ([kind] name / File: path:line / Sig: / Doc:).
 */
import type { SearchCandidate } from './types';

export type SearchSource = 'code_search' | 'mem_search';

export function parseSearchText(text: string, source: SearchSource): SearchCandidate[] {
  const out: SearchCandidate[] = [];
  let current: SearchCandidate | undefined;
  for (const rawLine of (text ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    current = consumeLine(line, current, out, source);
  }
  if (current) out.push(current);
  return out.filter((c) => c.name.length > 0);
}

function consumeLine(
  line: string,
  current: SearchCandidate | undefined,
  out: SearchCandidate[],
  source: SearchSource
): SearchCandidate | undefined {
  const head = /^\[([\w-]+)\]\s+(.+)$/.exec(line);
  if (head) {
    if (current) out.push(current);
    return { kind: head[1], name: head[2], filePath: head[2], source };
  }
  if (!current) return undefined;
  applyMeta(current, line);
  return current;
}

function applyMeta(candidate: SearchCandidate, line: string): boolean {
  const file = /^File:\s*(.+?):(\d+)$/.exec(line);
  if (file) {
    candidate.filePath = file[1];
    candidate.startLine = Number(file[2]);
    return true;
  }
  return applyDocMeta(candidate, line);
}

function applyDocMeta(candidate: SearchCandidate, line: string): boolean {
  const sig = /^Sig:\s*(.*)$/.exec(line);
  if (sig) {
    candidate.signature = sig[1].slice(0, 200);
    return true;
  }
  const doc = /^Doc:\s*(.*)$/.exec(line);
  if (doc) {
    candidate.docComment = doc[1].slice(0, 200);
    return true;
  }
  return false;
}
