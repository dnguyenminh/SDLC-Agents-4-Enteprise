/**
 * SA4E-42 — dependency-inversion ports so the re-index collaborators depend on
 * abstractions (testable with fakes), not concretions (DIP).
 */
import type Database from 'better-sqlite3';
import type { ToolDefinition } from '../../../../types/tool.js';
import type { ServerStateChangeCallback, Unsubscribe } from '../../types/health.js';

/** Generates a dense embedding vector for the given text. */
export interface IEmbedder {
  generateEmbedding(text: string): Promise<number[]>;
}

/** Live tool source + connection state (satisfied by McpClientManager). */
export interface IToolSource {
  getProxiedTools(): ToolDefinition[];
  isServerConnected(name: string): boolean;
}

/** Observable emitting server state-change events (satisfied by McpClientManager). */
export interface IStateChangeSource {
  onServerStateChange(cb: ServerStateChangeCallback): Unsubscribe;
}

/** Lazily resolves the memory DB at event time; returns null when not ready (IR-8). */
export type DbProvider = () => Database.Database | null;
