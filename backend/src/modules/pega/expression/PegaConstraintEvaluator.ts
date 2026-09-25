import { ExpressionParser } from './ExpressionParser.js';
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
      violations.push(...this.evaluateOne(constraint, clipboard));
    }

    return { passed: violations.length === 0, violations };
  }

  private evaluateOne(constraint: ConstraintRule, clipboard: PegaClipboardContext): ConstraintViolation[] {
    try {
      const ast = ExpressionParser.parseExpression(constraint.expression);
      const result = this.evaluator.evaluateWithAst(ast, clipboard, false);
      if (result.value.boolean) return [];

      const actualValue = this.resolveActualValue(constraint.targetProperty, clipboard);
      return [{
        propertyName: constraint.targetProperty,
        expectedExpression: constraint.expression,
        actualValue,
        message: constraint.label
          ? `Constraint '${constraint.label}' failed: ${constraint.expression}`
          : `Constraint on '${constraint.targetProperty}' failed: ${constraint.expression}. Actual: ${actualValue}`,
      }];
    } catch (err) {
      return [{
        propertyName: constraint.targetProperty,
        expectedExpression: constraint.expression,
        actualValue: 'ERROR',
        message: `Constraint evaluation error: ${(err as Error).message}`,
      }];
    }
  }

  private resolveActualValue(propertyName: string, clipboard: PegaClipboardContext): string {
    try {
      const parts = propertyName
        .replace(/^\./, '')
        .split('.')
        .filter(Boolean);
      if (parts.length === 0) return 'undefined';

      const ast = ExpressionParser.parseExpression(`.${parts.join('.')}`);
      const result = this.evaluator.evaluateWithAst(ast, clipboard, false);
      return result.value.text;
    } catch {
      return 'undefined';
    }
  }
}
