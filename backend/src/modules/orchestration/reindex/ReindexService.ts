/**
 * SA4E-42 — per-event re-index orchestration (Facade over embed + repository).
 * Applies the latest-state guard (IR-7), embeds tools (skip-on-fail), and persists
 * scoped changes fail-soft (BR-06). Never throws to the caller.
 */
import type { Logger } from 'pino';
import type { ToolDefinition } from '../../../types/tool.js';
import type { DbProvider, IEmbedder, IToolSource } from './models/ports.js';
import type { PreparedTool } from './models/PreparedTool.js';
import type { ReindexResult } from './models/ReindexResult.js';
import { McpToolsRepository } from './McpToolsRepository.js';
import { safeError } from './safeError.js';

const DEFAULT_TARGET_MS = 5000;

export class ReindexService {
  constructor(
    private readonly dbProvider: DbProvider,
    private readonly embedder: IEmbedder,
    private readonly toolSource: IToolSource,
    private readonly logger: Logger,
    private readonly targetMs = DEFAULT_TARGET_MS,
  ) {}

  async reindexConnected(server: string): Promise<ReindexResult> {
    const start = Date.now();
    const db = this.resolveDb(server);
    if (!db) return this.empty(server, start);
    if (!this.toolSource.isServerConnected(server)) {
      this.logger.warn({ server }, 're-index skipped: server not connected (stale event)');
      return this.empty(server, start);
    }
    const tools = this.scopedTools(server);
    if (tools.length === 0) {
      this.logger.warn({ server }, 'no proxied tools on connect; no-op');
      return this.empty(server, start);
    }
    const prepared = await this.prepareTools(tools, server);
    return this.persistConnected(db, prepared, server, start);
  }

  async reindexRemoved(server: string): Promise<ReindexResult> {
    const start = Date.now();
    const db = this.resolveDb(server);
    if (!db) return this.empty(server, start);
    const repo = new McpToolsRepository(db, this.logger);
    try {
      const removed = repo.deleteByServer(server);
      this.logger.info({ server, removed }, 're-index remove done');
      return { server, upserted: 0, removed, elapsedMs: Date.now() - start };
    } catch (e) {
      this.logger.warn(
        { server, phase: 'delete', err: safeError(e) },
        're-index remove failed; retry next event',
      );
      return this.empty(server, start);
    }
  }

  private resolveDb(server: string) {
    const db = this.dbProvider();
    if (!db) this.logger.warn({ server }, 'memory not ready; skip, will retry next event');
    return db;
  }

  private scopedTools(server: string): ToolDefinition[] {
    return this.toolSource.getProxiedTools().filter((t) => (t.category as string) === server);
  }

  private async prepareTools(tools: ToolDefinition[], server: string): Promise<PreparedTool[]> {
    const out: PreparedTool[] = [];
    for (const t of tools) {
      const prepared = await this.prepareOne(t, server);
      if (prepared) out.push(prepared);
    }
    return out;
  }

  private async prepareOne(t: ToolDefinition, server: string): Promise<PreparedTool | null> {
    try {
      const text = `Tool: ${t.name}\nDescription: ${t.description}`;
      const vector = await this.embedder.generateEmbedding(text);
      return {
        name: t.name,
        description: t.description,
        schemaJson: JSON.stringify(t.inputSchema || {}),
        category: server,
        server,
        vector: Buffer.from(new Float32Array(vector).buffer),
      };
    } catch (e) {
      this.logger.warn(
        { server, tool: t.name, phase: 'embed', err: safeError(e) },
        'embedding failed for tool; skip tool',
      );
      return null;
    }
  }

  private persistConnected(
    db: NonNullable<ReturnType<DbProvider>>,
    prepared: PreparedTool[],
    server: string,
    start: number,
  ): ReindexResult {
    const repo = new McpToolsRepository(db, this.logger);
    try {
      const counts = repo.applyConnected(prepared, server);
      const elapsedMs = Date.now() - start;
      this.warnIfSlow(server, elapsedMs);
      this.logger.info({ server, ...counts, elapsedMs }, 're-index add/update done');
      return { server, ...counts, elapsedMs };
    } catch (e) {
      this.logger.warn(
        { server, phase: 'write', err: safeError(e) },
        're-index write failed; retry next event',
      );
      return this.empty(server, start);
    }
  }

  private warnIfSlow(server: string, elapsedMs: number): void {
    if (elapsedMs > this.targetMs) {
      this.logger.warn({ server, elapsedMs, targetMs: this.targetMs }, 're-index exceeded target');
    }
  }

  private empty(server: string, start: number): ReindexResult {
    return { server, upserted: 0, removed: 0, elapsedMs: Date.now() - start };
  }
}
