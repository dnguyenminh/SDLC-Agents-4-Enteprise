import { parseExpression } from './pega-expr/parser.js';
import { PegaClipboardContext } from './PegaClipboardContext.js';
import { PegaExpressionEvaluator } from './PegaExpressionEvaluator.js';

export interface ConstraintViolation {
  propertyName: string;
  expectedExpression: string;
  actualValue: string;
  message: string;
}

export interface ConstraintResult {
  passed: boolean;
  violations: ConstraintViolation[];
}

export interface ConstraintRule {
  targetProperty: string;
  expression: string;
  label?: string;
  enabled?: boolean;
}

export class PegaConstraintEvaluator {
  private evaluator = new PegaExpressionEvaluator();

  evaluateConstraints(
    constraints: ConstraintRule[],
    clipboard: PegaClipboardContext,
  ): ConstraintResult {
    const violations: ConstraintViolation[] = [];

    for (const constraint of constraints) {
      if (constraint.enabled === false) continue;

      try {
        const ast = parseExpression(constraint.expression);
        const result = this.evaluator.evaluateWithAst(ast, clipboard, false);
        const passed = result.value.boolean;

        if (!passed) {
          const actualValue = this.resolveActualValue(constraint.targetProperty, clipboard);
          violations.push({
            propertyName: constraint.targetProperty,
            expectedExpression: constraint.expression,
            actualValue,
            message: constraint.label
              ? `Constraint '${constraint.label}' failed: ${constraint.expression}`
              : `Constraint on '${constraint.targetProperty}' failed: ${constraint.expression}. Actual: ${actualValue}`,
          });
        }
      } catch (err) {
        violations.push({
          propertyName: constraint.targetProperty,
          expectedExpression: constraint.expression,
          actualValue: 'ERROR',
          message: `Constraint evaluation error: ${(err as Error).message}`,
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  private resolveActualValue(propertyName: string, clipboard: PegaClipboardContext): string {
    try {
      const parts = propertyName
        .replace(/^\./, '')
        .split('.')
        .filter(Boolean);
      if (parts.length === 0) return 'undefined';

      const ast = parseExpression(`.${parts.join('.')}`);
      const result = this.evaluator.evaluateWithAst(ast, clipboard, false);
      return result.value.text;
    } catch {
      return 'undefined';
    }
  }
}
