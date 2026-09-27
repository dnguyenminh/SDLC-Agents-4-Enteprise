import { logger } from '../../logger';
import { withTimeout } from '../async-timeout';
import * as crypto from 'crypto';
import type { McpBridge } from '../../mcp/mcp-bridge';
import { McpBridgeCaller } from '../../mcp/mcp-bridge-caller';
import { isLoopbackHost } from '../../config/backend-url';
import { RetrievalValidationError } from './types';
import type { ISearchProvider, RetrievalConfig, SearchCandidate } from './types';
import { MAX_QUERY_CHARS } from '../query-router';

export interface McpCaller {
  callMcpWrapper(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}

/** SEC-325-D2: per-request fetch timeout for the loopback MCP wrapper. */
export const MCP_WRAPPER_FETCH_TIMEOUT_MS = 5_000;

/** SEC-325-D2: header carrying the per-session nonce on every wrapper call. */
export const SESSION_NONCE_HEADER = 'X-Session-Nonce';

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
    enforceQueryCap(query);
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

export function createMcpSearchProvider(config: RetrievalConfig, bridge: McpBridge): McpSearchProvider {
  return new McpSearchProvider({ caller: new McpBridgeCaller(bridge), config });
}

export function createMcpSearchProviderFromBridge(bridge: McpBridge, config: RetrievalConfig): McpSearchProvider {
  return new McpSearchProvider({ caller: new McpBridgeCaller(bridge), config });
}

/**
 * SEC-325-D4: fail-closed caller contract — the provider must never forward an
 * oversized query to MCP tools (defense-in-depth behind the entry
 * `validateQuery` in context-retriever.ts).
 */
function enforceQueryCap(query: string): void {
  if (typeof query !== 'string' || query.length > MAX_QUERY_CHARS) {
    throw new RetrievalValidationError(`Query exceeds ${MAX_QUERY_CHARS} chars`);
  }
}

/**
 * SEC-325-D2: loopback-only baseUrl validation for the MCP wrapper — any local
 * process can race for the wrapper port, so a wrapper URL must never point at a
 * remote host. Fail-closed: malformed, remote, or unsupported-protocol URLs
 * throw (stricter than validateBackendUrl — no insecure-remote bypass).
 */
export function validateLoopbackWrapperUrl(baseUrl: string): URL {
  const raw = (baseUrl ?? '').trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new RetrievalValidationError(`MCP wrapper URL is malformed: "${raw.slice(0, 100)}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new RetrievalValidationError(`MCP wrapper URL protocol "${parsed.protocol}" is not allowed`);
  }
  if (!isLoopbackHost(parsed.hostname)) {
    throw new RetrievalValidationError(`MCP wrapper URL must be loopback, received host "${parsed.hostname}"`);
  }
  return parsed;
}

/**
 * SEC-325-D2: per-session nonce — carried on every wrapper call so a spoofing
 * server cannot replay responses across sessions.
 */
export function createSessionNonce(): string {
  return crypto.randomUUID();
}

/**
 * SEC-325-D2: hardened HTTP caller for the loopback MCP wrapper (the client
 * side of `McpSearchProvider` → wrapper). Enforces the loopback-only URL policy
 * at construction (fail-closed), bounds every request with
 * `AbortSignal.timeout(MCP_WRAPPER_FETCH_TIMEOUT_MS)`, and carries the session
 * nonce header. Speaks the wrapper's JSON-RPC contract on `/mcp` (same shape as
 * `McpBridge.listTools`).
 */
export class HttpMcpCaller implements McpCaller {
  private readonly baseUrl: string;
  private readonly nonce: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, nonce: string = createSessionNonce(), timeoutMs: number = MCP_WRAPPER_FETCH_TIMEOUT_MS) {
    this.baseUrl = validateLoopbackWrapperUrl(baseUrl).toString();
    this.nonce = nonce;
    this.timeoutMs = timeoutMs;
  }

  async callMcpWrapper(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', [SESSION_NONCE_HEADER]: this.nonce },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: toolName, arguments: params } }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`MCP wrapper HTTP ${response.status}: ${response.statusText}`);
    }
    return this.extractResult(await response.json());
  }

  private extractResult(data: { result?: unknown; error?: { code: number; message: string } }): unknown {
    if (data.error) {
      throw new Error(`MCP error (${data.error.code}): ${data.error.message}`);
    }
    return data.result ?? data;
  }
}
