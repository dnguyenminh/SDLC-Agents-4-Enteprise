/**
 * Shared schema + helpers for admin database routes.
 * Extracted from server/routes/admin/database.ts (BR-18) — no behavior change.
 */

import { z } from 'zod';

export const connectionSchema = z.object({
  engine: z.enum(['postgresql', 'mysql']),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1),
  password: z.string().default(''),
  database: z.string().min(1),
  ssl: z.boolean().default(false),
});

/** Resolve active engine name from per-engine `active` flag (source of truth), falling back to `activeEngine`. */
export function resolveActiveEngineName(config: { activeEngine?: string; engines?: Record<string, { active?: boolean }> }): string {
  const engines = config.engines || {};
  for (const e of ['postgresql', 'mysql', 'sqlite']) {
    if (engines[e] && engines[e].active === true) return e;
  }
  return config.activeEngine || 'sqlite';
}
