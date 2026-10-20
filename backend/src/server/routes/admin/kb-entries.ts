/**
 * KB entries routes — search, list, and detail for KB entries.
 * SA4E-50: All admin-db calls are awaited since they are now async.
 * Facade (BR-18): handlers live in kb-entries-list.ts, kb-entries-detail.ts,
 * kb-entries-enrich-post.ts, kb-entries-enrich.ts.
 */

import { Hono } from 'hono';
import type { AdminContext } from './context.js';
import { handleKbSearch, handleKbEntryList, handleKbEntryDetail } from './kb-entries-list.js';
import { handleEnrichEntry } from './kb-entries-enrich-post.js';
import { handleEnrichPoll, handleEnrichSave } from './kb-entries-enrich.js';

export function createKbEntriesRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.post('/api/admin/search', async (c) => handleKbSearch(c, ctx));

  app.get('/api/admin/kb/entries', async (c) => handleKbEntryList(c, ctx));

  app.get('/api/admin/kb/entries/:id', async (c) => handleKbEntryDetail(c, ctx));

  /** On-demand enrichment: trigger LLM enrichment for a single unenriched entry. */
  app.post('/api/admin/kb/entries/:id/enrich', async (c) => handleEnrichEntry(c, ctx));

  app.get('/api/admin/kb/entries/:id/enrich/poll', async (c) => handleEnrichPoll(c, ctx));

  /** Save enrichment data from extension-side LLM (fallback path). */
  app.post('/api/admin/kb/entries/:id/enrich-save', async (c) => handleEnrichSave(c, ctx));

  return app;
}
