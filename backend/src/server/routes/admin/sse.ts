/**
 * admin/routes/sse.ts — Server-Sent Events for real-time dashboard stats.
 * SA4E-50: getKbEntryCount is now async; handler uses async wrapper.
 */

import { Hono } from 'hono';
import { getKbEntryCount } from '../../../admin/admin-db.js';
import { formatUptime, formatBytes } from './utils.js';
import type { AdminContext } from './context.js';

export function createSseRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.get('/api/admin/sse', async (c) => {
    const user = await ctx.authenticate(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    ctx.sseClients.add(writer);
    const encoder = new TextEncoder();

    writer.write(encoder.encode(
      `event: connected\ndata: ${JSON.stringify({ userId: user.userId, timestamp: new Date().toISOString() })}\n\n`,
    ));

    const buildStats = async () => {
      const uptimeMs = Date.now() - ctx.SERVER_START_TIME;
      const mem = process.memoryUsage();
      const userCount = await ctx.db.user.getUserCount();
      const kbCount = await getKbEntryCount(ctx.getRequestProjectId(c));
      return JSON.stringify({
        kbEntries: kbCount, users: userCount,
        uptime: { ms: uptimeMs, formatted: formatUptime(uptimeMs) },
        memory: {
          heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss,
          formatted: `${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`,
        },
        timestamp: new Date().toISOString(),
      });
    };

    writer.write(encoder.encode(`event: stats\ndata: ${await buildStats()}\n\n`));

    const interval = setInterval(async () => {
      try { writer.write(encoder.encode(`event: stats\ndata: ${await buildStats()}\n\n`)); }
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
