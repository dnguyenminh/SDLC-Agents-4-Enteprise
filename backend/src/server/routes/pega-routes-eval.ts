/**
 * Pega L3-L4 evaluation routes — expression/when/constraint/decision evaluation.
 * Extracted from pega-api.ts (BR-18).
 */
import type { Hono } from 'hono';
import { PegaExpressionEvaluator } from '../../modules/pega/expression/PegaExpressionEvaluator.js';
import { PegaClipboardContext } from '../../modules/pega/expression/PegaClipboardContext.js';
import { PegaWhenEvaluator } from '../../modules/pega/expression/PegaWhenEvaluator.js';
import { PegaConstraintEvaluator } from '../../modules/pega/expression/PegaConstraintEvaluator.js';
import { PegaEvaluationSandbox } from '../../modules/pega/security/PegaEvaluationSandbox.js';
import { ExprNodeValidator } from '../../modules/pega/expression/ExprNodeValidator.js';
import { parseExpression } from '../../modules/pega/expression/pega-expr/parser.js';
import { PegaDecisionTableEvaluator } from '../../modules/pega/decision/PegaDecisionTableEvaluator.js';
import { PegaDecisionTreeEvaluator } from '../../modules/pega/decision/PegaDecisionTreeEvaluator.js';
import type { PegaDecisionTableRow, DecisionTreeNode } from '../../modules/pega/decision/PegaEvaluationResult.js';
import type { PegaEnv, PegaRouteContext } from './pega-routes-context.js';

export function registerPegaEvalRoutes(app: Hono<PegaEnv>, ctx: PegaRouteContext): void {
  const { logger, evalCache } = ctx;

  app.post('/pega/evaluate-expression', async (c) => {
    try {
      const body = await c.req.json<{
        expression: string;
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
        timeout?: number;
      }>();

      const validator = new ExprNodeValidator();
      const validation = validator.validate(parseExpression(body.expression));
      if (!validation.valid) {
        return c.json({ data: null, error: { code: validation.errors[0].code, message: validation.errors[0].message } }, 400);
      }

      const cacheKey = `${body.expression}:${JSON.stringify(body.clipboard || {})}`;
      const cached = evalCache.get(cacheKey);
      if (cached) return c.json({ data: cached, error: null });

      const sandbox = new PegaEvaluationSandbox({ timeoutMs: body.timeout ?? 5000 });
      const result = await sandbox.evaluate({
        expression: body.expression,
        clipboard: body.clipboard || {},
        currentPage: body.currentPage,
      });

      evalCache.set(cacheKey, result);
      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/evaluate-expression failed');
      const status = err.code === 'PARSE_ERROR' || err.code === 'PROPERTY_NOT_FOUND' || err.code === 'FUNCTION_NOT_ALLOWED' ? 400 : 500;
      return c.json({ data: null, error: { code: err.code || 'INTERNAL_ERROR', message: err.message } }, status);
    }
  });

  app.post('/pega/evaluate-when', async (c) => {
    try {
      const body = await c.req.json<{
        expression: string;
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();

      const clipCtx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const whenEval = new PegaWhenEvaluator();
      const result = whenEval.evaluateWhen(body.expression, clipCtx);

      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/evaluate-when failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/evaluate-constraints', async (c) => {
    try {
      const body = await c.req.json<{
        constraints: Array<{ targetProperty: string; expression: string; label?: string; enabled?: boolean }>;
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();

      const clipCtx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const constraintEval = new PegaConstraintEvaluator();
      const result = constraintEval.evaluateConstraints(body.constraints, clipCtx);

      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/evaluate-constraints failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/evaluate-decision-table', async (c) => {
    try {
      const body = await c.req.json<{
        rows: PegaDecisionTableRow[];
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();
      const clipCtx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const evaluator = new PegaExpressionEvaluator();
      const tableEval = new PegaDecisionTableEvaluator();
      const result = tableEval.evaluate(body.rows, clipCtx, evaluator);
      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/evaluate-decision-table failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/evaluate-decision-tree', async (c) => {
    try {
      const body = await c.req.json<{
        rootNode: DecisionTreeNode;
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();
      const clipCtx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const evaluator = new PegaExpressionEvaluator();
      const treeEval = new PegaDecisionTreeEvaluator();
      const result = treeEval.evaluate(body.rootNode, clipCtx, evaluator);
      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/evaluate-decision-tree failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });
}
