// ─── PegaParserRegistry integration ─────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { PegaParserRegistry } from '../../strategies/PegaParserRegistry.js';
import { registerDeclareParsers } from '../../declare/index.js';

describe('PegaDeclareParser registry integration', () => {
  it('can be registered and used via PegaParserRegistry', () => {
    const registry = new PegaParserRegistry();
    registerDeclareParsers(registry);

    const json = {
      pxObjClass: 'Rule-Declare-Expressions',
      pyClassName: 'Work-Order',
      pyRuleName: 'CalcTotal',
      pyProperty: 'pyTotal',
      pyExpression: '.pyQty * .pyPrice',
    };

    const result = registry.parse(json);
    expect(result.symbol.ruleType).toBe('Rule-Declare-Expressions');
    expect(result.symbol.name).toBe('CalcTotal');
    expect(result.symbol.logicSummary).toContain('pyTotal');
  });

  it('registers before fallback so Declare rules are handled first', () => {
    const registry = new PegaParserRegistry();
    registerDeclareParsers(registry);

    // Non-Declare rule should still work via fallback
    const activityJson = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Order',
      pyActivityName: 'ProcessOrder',
    };

    const result = registry.parse(activityJson);
    // Activity should go to ActivityParserStrategy (registered first in constructor)
    // but should still return a valid result
    expect(result.symbol.name).toBe('ProcessOrder');
  });
});
