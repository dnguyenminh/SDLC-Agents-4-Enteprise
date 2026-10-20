import { PegaRuleUnderstandingService } from '../../understanding/PegaRuleUnderstandingService.js';
import { PegaSchemaInferrer } from '../../inference/PegaSchemaInferrer.js';
import { PegaFieldDocumentor } from '../../inference/PegaFieldDocumentor.js';
import { PegaSemanticAnalyzer } from '../../semantic/PegaSemanticAnalyzer.js';
import { PegaRuleSimulator } from '../../semantic/PegaRuleSimulator.js';
import { PegaReferenceExtractor } from '../../references/PegaReferenceExtractor.js';
import { PegaMetaModelRegistry } from '../../metamodel/PegaMetaModelRegistry.js';
import { PegaMetaModelCompiler } from '../../metamodel/PegaMetaModelCompiler.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Shared fixtures and service factory for the PegaRuleUnderstandingService
// test suites. Copied verbatim from the original PegaRuleUnderstanding.test.ts.

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const schemasDir = path.resolve(__dirname, '../../schemas');

// ── Inline Test Fixtures ──────────────────────────────────────────────

export const ACTIVITY_FIXTURE = {
  pxObjClass: 'Rule-Obj-Activity',
  pyClassName: 'Work-Order',
  pyActivityName: 'CalculateOrderTotal',
  pyLabel: 'Calculate Order Total with Discounts',
  pyDescription: 'Calculates the total order amount applying tier-based discounts',
  steps: [
    { pyStepNum: '1', pyMethod: 'Property-Set', pyMethodParameters: '.pyTotal', pyLabel: 'Init Total' },
    { pyStepNum: '2', pyMethod: 'Call', pyMethodParameters: 'Work-Order.CalculateDiscount', pyLabel: 'Calc Discount' },
    { pyStepNum: '3', pyMethod: 'Property-Set', pyMethodParameters: '.pyGrandTotal', pyLabel: 'Apply Grand Total' },
    { pyStepNum: '4', pyMethod: 'Obj-Save', pyMethodParameters: 'Work-Order', pyLabel: 'Save Order' },
  ],
};

export const DATA_TRANSFORM_FIXTURE = {
  pxObjClass: 'Rule-Obj-Model',
  pyClassName: 'Work-Order',
  pyModelName: 'InitializeOrderData',
  pyLabel: 'Initialize Order Data Transform',
  pyActions: [
    { pyActionType: 'Set', pyTarget: '.OrderDate', pySource: '.CurrentDate' },
    { pyActionType: 'Set', pyTarget: '.Status', pySource: '.DefaultStatus' },
    { pyActionType: 'Apply Data Transform', pyTarget: 'SetCustomerDefaults' },
  ],
};

export const DECISION_TABLE_FIXTURE = {
  pxObjClass: 'Rule-Declare-DecisionTable',
  pyClassName: 'Work-Order',
  pyLabel: 'DetermineDiscountTable',
  pyPropertyEvaluated: '.OrderTotal',
  pyDecisionTableRows: [
    { pyCondition: '.OrderTotal > 1000', pyResult: '10%', pyPriority: 1 },
    { pyCondition: '.OrderTotal > 500', pyResult: '5%', pyPriority: 2 },
    { pyCondition: 'true', pyResult: '0%', pyPriority: 3 },
  ],
  pyReturnActions: [{ pyTransformName: 'ApplyDiscount' }],
};

export const FLOW_FIXTURE = {
  pxObjClass: 'Rule-Obj-Flow',
  pyClassName: 'Work-Order',
  pyFlowName: 'OrderProcessingFlow',
  pyLabel: 'Main Order Processing Flow',
  pyShapes: [
    { pyShapeType: 'Start', pyName: 'Begin' },
    { pyShapeType: 'Action', pyFlowActionName: 'ValidateOrder', pyWhenCondition: 'IsOrderValid' },
    { pyShapeType: 'Decision', pyWhenCondition: 'IsApproved' },
    { pyShapeType: 'Action', pyFlowActionName: 'ProcessPayment' },
    { pyShapeType: 'End', pyName: 'Complete' },
  ],
};

export const SIMPLE_RULE_FIXTURE = {
  pxObjClass: 'Rule-Obj-When',
  pyClassName: 'Work-Order',
  pyRuleName: 'IsHighPriority',
  pyLabel: 'Is High Priority Check',
};

export const UNKNOWN_RULE_FIXTURE = {
  pxObjClass: 'Rule-Obj-CustomAnalyzer',
  pyClassName: 'Work-Order',
  pyRuleName: 'CustomAnalysis',
  pyThreshold: '100',
  pyTransformName: 'NormalizeData',
};

let unknownCounter = 0;
export function makeUniqueUnknownFixture(): Record<string, unknown> {
  unknownCounter++;
  const cls = `Rule-Obj-Custom-${unknownCounter}`;
  return {
    pxObjClass: cls,
    pyClassName: 'Work-Order',
    pyRuleName: `CustomAnalysis${unknownCounter}`,
    pyThreshold: String(unknownCounter * 100),
    pyTransformName: 'NormalizeData',
  };
}

export const EMPTY_JSON = {};

// ── Service Factory ───────────────────────────────────────────────────

export function createService(): PegaRuleUnderstandingService {
  const inferrer = new PegaSchemaInferrer();
  const documentor = new PegaFieldDocumentor(inferrer);
  const analyzer = new PegaSemanticAnalyzer();
  const simulator = new PegaRuleSimulator();
  const extractor = new PegaReferenceExtractor();
  const registry = PegaMetaModelRegistry.getInstance();
  const compiler = new PegaMetaModelCompiler(registry);
  return new PegaRuleUnderstandingService(
    inferrer, documentor, analyzer, simulator, extractor, registry, compiler,
  );
}
