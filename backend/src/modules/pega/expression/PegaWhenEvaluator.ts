import { PegaClipboardContext } from './PegaClipboardContext.js';
import { PegaExpressionEvaluator } from './PegaExpressionEvaluator.js';

export interface WhenConditionResult {
  passed: boolean;
  trace: string[];
}

export class PegaWhenEvaluator {
  private evaluator = new PegaExpressionEvaluator();

  evaluateWhen(
    whenExpression: string,
    clipboard: PegaClipboardContext,
  ): WhenConditionResult {
    const trace: string[] = [];
    trace.push(`Evaluating When: ${whenExpression}`);

    try {
      const result = this.evaluator.evaluate(whenExpression, clipboard, true);
      const passed = result.value.boolean;
      trace.push(`→ ${passed ? 'PASS' : 'FAIL'}`);

      return { passed, trace };
    } catch (err) {
      trace.push(`→ ERROR: ${(err as Error).message}`);
      return { passed: false, trace };
    }
  }

  evaluateWhenFromConditionText(
    conditionText: string,
    clipboard: PegaClipboardContext,
  ): WhenConditionResult {
    const expression = this.convertConditionToExpression(conditionText);
    return this.evaluateWhen(expression, clipboard);
  }

  private convertConditionToExpression(conditionText: string): string {
    const expr = conditionText.trim();

    if (expr.includes('.AND.')) {
      const parts = expr.split('.AND.').map(p => p.trim());
      const converted = parts.map(p => this.convertConditionToExpression(p));
      return `(${converted.join(') .AND. (')})`;
    }

    if (expr.includes('.OR.')) {
      const parts = expr.split('.OR.').map(p => p.trim());
      const converted = parts.map(p => this.convertConditionToExpression(p));
      return `(${converted.join(') .OR. (')})`;
    }

    const operators = ['=', '<>', '>', '<', '>=', '<='];
    for (const op of operators) {
      const idx = expr.indexOf(op);
      if (idx > 0) {
        const left = expr.substring(0, idx).trim();
        const right = expr.substring(idx + op.length).trim();
        const formattedLeft = left.startsWith('.') ? left : `.${left}`;
        let formattedRight = right;
        if (!right.startsWith('"') && !right.startsWith("'") && !/^-?\d/.test(right) && !right.startsWith('@')) {
          formattedRight = `"${right}"`;
        }
        return `${formattedLeft} ${op} ${formattedRight}`;
      }
    }

    if (expr.includes('.')) {
      return expr.startsWith('.') ? expr : `.${expr}`;
    }

    return expr;
  }
}
