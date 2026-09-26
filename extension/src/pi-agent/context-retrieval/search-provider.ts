import { logger } from '../../logger';
import { withTimeout } from '../async-timeout';
import { McpWrapperClient } from '../extensions/mcp-wrapper-client';
import type { ISearchProvider, RetrievalConfig, SearchCandidate } from './types';

export interface McpCaller {
  callMcpWrapper(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}

interface McpToolPayload {
  content?: Array<{ type?: string; text?: string }>;
}

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

export function extractText(raw: unknown): string {
  const payload = raw as McpToolPayload;
  if (Array.isArray(payload?.content)) {
    return payload.content.map((block) => block?.text ?? '').join('\n');
  }
  return typeof raw === 'string' ? raw : '';
}

export async function withSearchTimeout<T>(promise: Promise<T>, ms: number, tool: string): Promise<T> {
  return withTimeout(promise, ms, `Search tool ${tool} timed out after ${ms}ms`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function dedupeCandidates(list: SearchCandidate[]): SearchCandidate[] {
  const seen = new Set<string>();
  return list.filter((candidate) => {
    const key = `${candidate.filePath}::${candidate.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class McpSearchProvider implements ISearchProvider {
  constructor(private readonly deps: { caller: McpCaller; config: RetrievalConfig }) {}

  async search(query: string, topK: number): Promise<SearchCandidate[]> {
    const codeResults = await this.withRetry('code_search', query, topK);
    const memResults = await this.optional('mem_search', query, topK);
    return dedupeCandidates(codeResults.concat(memResults)).slice(0, topK);
  }

  private async callTool(tool: SearchSource, query: string, topK: number): Promise<SearchCandidate[]> {
    const raw = await withSearchTimeout(
      this.deps.caller.callMcpWrapper(tool, { query, limit: topK }),
      this.deps.config.searchTimeoutMs,
      tool
    );
    return parseSearchText(extractText(raw), tool);
  }

  private async withRetry(tool: SearchSource, query: string, topK: number): Promise<SearchCandidate[]> {
    try {
      return await this.callTool(tool, query, topK);
    } catch (err) {
      logger.warn(`Search tool ${tool} failed, retrying once`, { error: (err as Error).message });
      await sleep(this.deps.config.retryBackoffMs);
      return await this.callTool(tool, query, topK);
    }
  }

  private async optional(tool: SearchSource, query: string, topK: number): Promise<SearchCandidate[]> {
    try {
      return await this.withRetry(tool, query, topK);
    } catch (err) {
      logger.warn(`Search tool ${tool} unavailable, continuing without it`, {
        error: (err as Error).message,
      });
      return [];
    }
  }
}

export function createMcpSearchProvider(config: RetrievalConfig, baseUrl?: string): McpSearchProvider {
  const caller = baseUrl ? new McpWrapperClient(baseUrl) : new McpWrapperClient();
  return new McpSearchProvider({ caller, config });
}
