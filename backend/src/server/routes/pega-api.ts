/**
 * Pega API Routes — Check rule, Ingest rule, Get schemas, Upsert schema, Browser plan, Crawl, Project detect.
 * Facade (BR-18): route groups live in sibling modules — pega-routes-context.ts,
 * pega-routes-core.ts, pega-routes-crawl.ts, pega-routes-tools.ts,
 * pega-routes-eval.ts, pega-routes-ui.ts.
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { createPegaRouteContext } from './pega-routes-context.js';
import type { PegaEnv } from './pega-routes-context.js';
import { registerPegaCoreRoutes } from './pega-routes-core.js';
import { registerPegaCrawlRoutes } from './pega-routes-crawl.js';
import { registerPegaToolRoutes } from './pega-routes-tools.js';
import { registerPegaEvalRoutes } from './pega-routes-eval.js';
import { registerPegaUiRoutes } from './pega-routes-ui.js';

export type { PegaEnv } from './pega-routes-context.js';

export function createPegaApiRoutes(registry: ModuleRegistry, logger: Logger): Hono<PegaEnv> {
  const app = new Hono<PegaEnv>();
  const ctx = createPegaRouteContext(registry, logger);

  registerPegaCoreRoutes(app, ctx);
  registerPegaCrawlRoutes(app, ctx);
  registerPegaToolRoutes(app, ctx);
  // L3-L4 endpoints
  registerPegaEvalRoutes(app, ctx);
  registerPegaUiRoutes(app, ctx);

  return app;
}
