import * as fs from 'fs';
import * as path from 'path';
import type { TokenCounter } from './token-counter';
import type { SearchCandidate } from './types';

export interface IContentReader {
  readHead(filePath: string, maxLines: number): string;
}

/** SEC-325-D3: hard size cap before any file read — a multi-GB file (legit or
 * hostile workspace) must never be read whole into the extension host. */
export const MAX_READ_BYTES = 1_048_576;

export class FsContentReader implements IContentReader {
  // SEC-325-D3: stat-first + 1 MB cap + line-limited read — only bounded heads
  // reach disclosure; whole-file reads previously froze the extension host.
  readHead(filePath: string, maxLines: number): string {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > MAX_READ_BYTES) return '';
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.split('\n').slice(0, maxLines).join('\n');
    } catch {
      return '';
    }
  }
}

export class SymbolOutlineExtractor {
  constructor(
    private readonly counter: TokenCounter,
    private readonly reader: IContentReader
  ) {}

  extractOutline(filePath: string, symbols: SearchCandidate[], maxTokens: number): string {
    const lines: string[] = [`// ${path.basename(filePath)}`];
    for (const symbol of symbols) {
      const line = symbol.signature
        ? `${symbol.kind} ${symbol.name} ${trimSignature(symbol.signature)}`
        : `${symbol.kind} ${symbol.name}`;
      lines.push(line);
      if (this.counter.estimate(lines.join('\n')) > maxTokens) {
        lines.pop();
        break;
      }
    }
    return lines.join('\n');
  }

  extractChunk(filePath: string, maxLines: number, maxTokens: number): string {
    const head = this.reader.readHead(filePath, maxLines);
    if (!head) return '';
    return this.trimToTokenBudget(head, maxTokens);
  }

  private trimToTokenBudget(text: string, maxTokens: number): string {
    const lines = text.split('\n');
    while (lines.length > 0 && this.counter.estimate(lines.join('\n')) > maxTokens) {
      lines.pop();
    }
    return lines.join('\n');
  }
}

function trimSignature(signature: string): string {
  const single = signature.replace(/\s+/g, ' ').trim();
  return single.length > 120 ? `${single.slice(0, 117)}...` : single;
}
