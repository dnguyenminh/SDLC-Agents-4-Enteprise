import { parseExpression } from '../expression/pega-expr/parser.js';
import { PegaExpressionEvaluator } from '../expression/PegaExpressionEvaluator.js';
import { PegaClipboardContext } from '../expression/PegaClipboardContext.js';
import { ExprNodeValidator } from '../expression/ExprNodeValidator.js';
import type { EvaluationResult } from '../expression/PegaExpressionEvaluator.js';

export interface SandboxConfig {
  timeoutMs: number;
  maxDepth: number;
  maxExpressionLength: number;
}

const DEFAULT_CONFIG: SandboxConfig = {
  timeoutMs: 5000,
  maxDepth: 100,
  maxExpressionLength: 100_000,
};

export interface SandboxEvaluationRequest {
  expression: string;
  clipboard: Record<string, Record<string, unknown>>;
  currentPage?: string;
  timeout?: number;
}

export class PegaEvaluationSandbox {
  private evaluator = new PegaExpressionEvaluator();
  private validator = new ExprNodeValidator();
  private config: SandboxConfig;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Safely evaluate an expression: enforce length, parse, whitelist-validate, then evaluate
   * under a timeout. Deny-by-default — any validation error rejects before evaluation.
   * @param request Expression + clipboard + optional page/timeout
   * @returns Evaluation result
   * @throws Validation result object, or an Error on parse/length/timeout failure
   */
  async evaluate(request: SandboxEvaluationRequest): Promise<EvaluationResult> {
    const timeout = request.timeout ?? this.config.timeoutMs;
    const { expression } = request;

    if (expression.length > this.config.maxExpressionLength) {
      throw new Error(`Expression exceeds max length of ${this.config.maxExpressionLength} characters`);
    }

    // Parse once with the ANTLR parser, then validate the AST against the whitelist.
    const ast = parseExpression(expression);
    const validation = this.validator.validate(ast);
    if (!validation.valid) {
      throw validation;
    }

    const clipboard = new PegaClipboardContext(
      request.clipboard,
      request.currentPage ?? 'pyWorkPage',
    );

    return this.evaluateWithTimeout(ast, clipboard, timeout);
  }

  /** Evaluate a pre-parsed AST, rejecting if it exceeds the timeout. */
  private evaluateWithTimeout(
    ast: ReturnType<typeof parseExpression>,
    clipboard: PegaClipboardContext,
    timeoutMs: number,
  ): Promise<EvaluationResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Evaluation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = this.evaluator.evaluateWithAst(ast, clipboard, true);
        clearTimeout(timer);
        resolve(result);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }
}
