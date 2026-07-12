// KSA-286: SSE (Server-Sent Events) Manager
import pino from 'pino';
import { Response } from 'express';

const logger = pino({ name: 'sse-manager' });

interface SSEClient { userId: string; res: Response; connectedAt: number; }

export class SSEManager {
  private clients = new Map<string, SSEClient>();
  private heartbeatInterval: NodeJS.Timeout;

  constructor() { this.heartbeatInterval = setInterval(() => this.heartbeat(), 15000); }

  addClient(userId: string, res: Response): void {
    // Close existing connection for this user (1 per user limit)
    const existing = this.clients.get(userId);
    if (existing) { try { existing.res.end(); } catch { logger.trace({ context: 'sse-add' }, 'Failed to close existing SSE connection (already disconnected)'); } }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 30000\n\n');
    this.clients.set(userId, { userId, res, connectedAt: Date.now() });

    res.on('close', () => { this.clients.delete(userId); });
  }

  broadcast(event: string, data: any): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients.values()) { try { client.res.write(msg); } catch { logger.trace({ context: 'sse-broadcast' }, 'Failed to write to SSE client (likely disconnected)'); } }
  }

  sendToUser(userId: string, event: string, data: any): void {
    const client = this.clients.get(userId);
    if (client) { try { client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { logger.trace({ context: 'sse-send', userId }, 'Failed to send event to SSE client (likely disconnected)'); } }
  }

  private heartbeat(): void {
    for (const client of this.clients.values()) { try { client.res.write(': keepalive\n\n'); } catch { this.clients.delete(client.userId); } }
  }

  getClientCount(): number { return this.clients.size; }

  destroy(): void { clearInterval(this.heartbeatInterval); for (const c of this.clients.values()) { try { c.res.end(); } catch { logger.trace({ context: 'sse-destroy' }, 'Failed to end SSE response during destroy'); } } this.clients.clear(); }
}
