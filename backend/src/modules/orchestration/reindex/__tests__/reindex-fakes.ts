/**
 * SA4E-42 — shared test doubles for the re-index unit/integration tests.
 * Deterministic embeddings, an in-memory tool source, and a driveable event source.
 */
import type { ToolDefinition } from '../../../../types/tool.js';
import type {
  ServerStateChangeCallback,
  ServerStateChangeEvent,
  ConnectionState,
  Unsubscribe,
} from '../../types/health.js';
import type { IEmbedder, IStateChangeSource, IToolSource } from '../models/ports.js';

export class FakeEmbedder implements IEmbedder {
  constructor(private readonly throwFor: Set<string> = new Set()) {}
  failFor(name: string): void { this.throwFor.add(name); }
  async generateEmbedding(text: string): Promise<number[]> {
    for (const bad of this.throwFor) {
      if (text.includes(`Tool: ${bad}\n`)) throw new Error(`embed failed for ${bad}`);
    }
    const v = [0, 0, 0, 0];
    for (let i = 0; i < text.length; i++) v[i % 4] += text.charCodeAt(i) / 255;
    return v;
  }
}

export function tool(name: string, server: string, description = `${name} desc`): ToolDefinition {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties: {} },
    category: server as ToolDefinition['category'],
  };
}

export class FakeToolSource implements IToolSource {
  private readonly byServer = new Map<string, ToolDefinition[]>();
  private readonly connected = new Set<string>();

  setTools(server: string, names: string[]): void {
    this.byServer.set(server, names.map((n) => tool(n, server)));
  }
  setToolDefs(server: string, defs: ToolDefinition[]): void { this.byServer.set(server, defs); }
  setConnected(server: string, isConnected: boolean): void {
    if (isConnected) this.connected.add(server);
    else this.connected.delete(server);
  }
  getProxiedTools(): ToolDefinition[] {
    return Array.from(this.byServer.values()).flat();
  }
  isServerConnected(name: string): boolean { return this.connected.has(name); }
}

export class FakeEventSource implements IStateChangeSource {
  private readonly callbacks = new Set<ServerStateChangeCallback>();
  unsubscribeCount = 0;

  onServerStateChange(cb: ServerStateChangeCallback): Unsubscribe {
    this.callbacks.add(cb);
    return () => { this.callbacks.delete(cb); this.unsubscribeCount++; };
  }
  get listenerCount(): number { return this.callbacks.size; }

  emit(serverName: string, newState: ConnectionState, error?: string): void {
    const event: ServerStateChangeEvent = {
      serverName,
      previousState: 'reconnecting',
      newState,
      timestamp: new Date().toISOString(),
      error,
    };
    for (const cb of this.callbacks) cb(event);
  }
}
