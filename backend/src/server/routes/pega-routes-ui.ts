/**
 * Pega UI/simulation routes — simulate-flow, render-section, render-harness, health.
 * Extracted from pega-api.ts (BR-18).
 */
import type { Hono } from 'hono';
import { PegaFlowGraphBuilder } from '../../modules/pega/workflow/PegaFlowGraphBuilder.js';
import { PegaWorkflowEngine } from '../../modules/pega/workflow/PegaWorkflowEngine.js';
import { PegaClipboardContext } from '../../modules/pega/expression/PegaClipboardContext.js';
import { PegaSectionRenderer } from '../../modules/pega/ui/PegaSectionRenderer.js';
import { PegaHarnessAssembler } from '../../modules/pega/ui/PegaHarnessAssembler.js';
import type { PegaSection } from '../../modules/pega/ui/PegaUITypes.js';
import type { PegaEnv, PegaRouteContext } from './pega-routes-context.js';

export function registerPegaUiRoutes(app: Hono<PegaEnv>, ctx: PegaRouteContext): void {
  const { logger, evalCache } = ctx;

  app.post('/pega/simulate-flow', async (c) => {
    try {
      const body = await c.req.json<{
        flowJson: { pyShapes?: Record<string, unknown>[]; shapes?: Record<string, unknown>[]; pyConnectors?: Record<string, unknown>[]; connectors?: Record<string, unknown>[] };
        initialClipboard?: Record<string, Record<string, unknown>>;
        startShapeId?: string;
      }>();

      const shapes = body.flowJson.pyShapes || body.flowJson.shapes || [];
      const connectors = body.flowJson.pyConnectors || body.flowJson.connectors || [];

      const builder = new PegaFlowGraphBuilder();
      const graph = builder.build(shapes, connectors);

      const clipCtx = new PegaClipboardContext(body.initialClipboard || {});

      const engine = new PegaWorkflowEngine();
      const result = engine.simulate(graph, clipCtx, body.startShapeId);

      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/simulate-flow failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/render-section', async (c) => {
    try {
      const body = await c.req.json<{
        section: PegaSection;
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();
      const clipCtx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const sectionRenderer = new PegaSectionRenderer();
      const html = sectionRenderer.renderSection(body.section, clipCtx);
      return c.json({ data: { html }, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/render-section failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/render-harness', async (c) => {
    try {
      const body = await c.req.json<{
        sections: { header?: PegaSection; content?: PegaSection; footer?: PegaSection };
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();
      const clipCtx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const assembler = new PegaHarnessAssembler();
      const html = assembler.assemble(body.sections, clipCtx);
      return c.json({ data: { html }, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/render-harness failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.get('/pega/health', async (c) => {
    return c.json({
      data: {
        status: 'ok',
        cacheSize: evalCache.size,
        modules: {
          expression: true,
          workflow: true,
          constraints: true,
          when: true,
          validation: true,
          sandbox: true,
          cache: true,
          decisionTable: true,
          decisionTree: true,
          sectionRenderer: true,
          harnessAssembler: true,
        },
      },
      error: null,
    });
  });
}
