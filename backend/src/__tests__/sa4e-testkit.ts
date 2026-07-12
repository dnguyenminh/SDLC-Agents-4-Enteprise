/**
 * SA4E-18 test kit — shared helpers for Tool Visibility Tiers tests.
 * Provides temp SQLite DB (real better-sqlite3) and a lightweight stub module.
 */

import { DatabaseManager } from '../engine/db/database-manager.js';
import { MemoryEngine } from '../modules/memory/engine/index.js';
import type { IModule, ModuleStatus } from '../types/module.js';
import type { ToolHandler, ToolDefinition } from '../types/tool.js';
import pino from 'pino';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const silentLogger = () => pino({ level: 'silent' }) as any;

export interface TempDb {
  dbManager: DatabaseManager;
  engine: MemoryEngine;
  tmpDir: string;
  close(): void;
}

/** Create a fresh temp file-backed SQLite DB with full SCHEMA_V1 applied. */
export function makeTempDb(): TempDb {
  (DatabaseManager as any).sharedDb = null;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e18-'));
  const dbPath = path.join(tmpDir, 'index.db');
  const dbManager = new DatabaseManager(dbPath);
  dbManager.initialize();
  const engine = new MemoryEngine(dbManager.getDb());
  return {
    dbManager,
    engine,
    tmpDir,
    close() {
      dbManager.close();
      (DatabaseManager as any).sharedDb = null;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/** Lightweight IModule stub with injectable status, engine, defs and handlers. */
export class StubModule implements IModule {
  private _status: ModuleStatus;
  constructor(
    readonly name: string,
    private defs: ToolDefinition[] = [],
    private handlers: Map<string, ToolHandler> = new Map(),
    private engine?: MemoryEngine,
    status: ModuleStatus = 'ready',
  ) {
    this._status = status;
  }
  get status(): ModuleStatus { return this._status; }
  setStatus(s: ModuleStatus): void { this._status = s; }
  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  getToolHandlers(): Map<string, ToolHandler> { return this.handlers; }
  getToolDefinitions(): ToolDefinition[] { return this.defs; }
  getEngine(): MemoryEngine { return this.engine as MemoryEngine; }
}

/** Build a ToolDefinition quickly. */
export function def(name: string, category: ToolDefinition['category'] = 'memory'): ToolDefinition {
  return { name, description: `${name} tool`, inputSchema: { type: 'object', properties: {} }, category };
}

/** A success tool handler returning text. */
export const okHandler: ToolHandler = async () => ({ content: [{ type: 'text', text: 'ok' }], isError: false });

/** An error tool handler (isError=true). */
export const errHandler: ToolHandler = async () => ({ content: [{ type: 'text', text: 'boom' }], isError: true });

// ─── MCP in-process client/server harness (IT tests) ──────────────────

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ModuleRegistry } from '../modules/ModuleRegistry.js';
import { getMcpServer } from '../server/mcpServer.js';

export interface McpHarness {
  client: Client;
  close(): Promise<void>;
}

/** Wire a real getMcpServer(registry) to a Client over linked in-memory transports. */
export async function connectMcp(registry: ModuleRegistry): Promise<McpHarness> {
  const server = getMcpServer(registry, silentLogger());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'sa4e18-test-client', version: '1.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    async close() { await client.close(); await server.close(); },
  };
}

/** The canonical 8 CORE tool names (5 memory + 3 meta). */
export const CORE_8 = [
  'mem_search', 'mem_ingest', 'mem_ingest_file', 'code_search',
  'get_curated_context', 'find_tools', 'execute_dynamic_tool', 'orchestration_status',
];
