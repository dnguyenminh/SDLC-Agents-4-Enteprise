import { Hono } from 'hono';
import { getAdminDb, getKbEntryCount } from '../../../admin/admin-db.js';
import { formatUptime, formatBytes } from './utils.js';
import type { AdminContext } from './context.js';

export function createSseRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.get('/api/admin/sse', (c) => {
    const user = ctx.authenticate(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    ctx.sseClients.add(writer);
    const encoder = new TextEncoder();
    writer.write(encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId: user.userId, timestamp: new Date().toISOString() })}\n\n`));
    const buildStats = () => {
      const uptimeMs = Date.now() - ctx.SERVER_START_TIME;
      const mem = process.memoryUsage();
      const d = getAdminDb();
      const userCount = (d.prepare('SELECT COUNT(*) as cnt FROM users').get() as any).cnt;
      const kbCount = getKbEntryCount(ctx.getRequestProjectId(c));
      return JSON.stringify({
        kbEntries: kbCount, users: userCount,
        uptime: { ms: uptimeMs, formatted: formatUptime(uptimeMs) },
        memory: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss, formatted: formatBytes(mem.heapUsed) + ' / ' + formatBytes(mem.heapTotal) },
        timestamp: new Date().toISOString(),
      });
    };
    writer.write(encoder.encode(`event: stats\ndata: ${buildStats()}\n\n`));
    const interval = setInterval(() => {
      try { writer.write(encoder.encode(`event: stats\ndata: ${buildStats()}\n\n`)); }
      catch { clearInterval(interval); ctx.sseClients.delete(writer); }
    }, 30000);
    c.req.raw.signal.addEventListener('abort', () => {
      clearInterval(interval);
      ctx.sseClients.delete(writer);
      writer.close().catch(() => {});
    });
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  });

  return app;
}
