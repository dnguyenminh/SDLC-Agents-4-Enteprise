import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';
import type { PegaExpressionEvaluator } from '../../expression/PegaExpressionEvaluator.js';

// Shared clipboard context and mocked expression evaluator used by the
// PegaDecisionEvaluator test suites (table, tree, fieldResolver).
// Copied verbatim from the original PegaDecisionEvaluator.test.ts header.

export const context = new PegaClipboardContext({
  pyWorkPage: {
    Status: { type: 'Text', value: 'Open' },
    Amount: { type: 'Number', value: 100 },
    CustomerType: { type: 'Text', value: 'Premium' },
    Priority: { type: 'Text', value: 'High' },
    Name: { type: 'Text', value: 'John' },
  },
});

export const mockEvaluator = {
  evaluate: (_expr: string) => {
    const customResults: Record<string, unknown> = {
      '@MyRule.IsHigh': true,
      '@MyRule.IsLow': false,
      '@MyRule.Null': null,
    };
    const val = _expr in customResults ? customResults[_expr] : true;
    return { value: { value: val, boolean: Boolean(val) }, trace: [] };
  },
} as unknown as PegaExpressionEvaluator;
