import { PegaExpressionEvaluator } from '../expression/PegaExpressionEvaluator.js';
import { PegaClipboardContext } from '../expression/PegaClipboardContext.js';
import { PegaExpressionValidator } from './PegaExpressionValidator.js';
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
  private validator = new PegaExpressionValidator();
  private config: SandboxConfig;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async evaluate(request: SandboxEvaluationRequest): Promise<EvaluationResult> {
    const timeout = request.timeout ?? this.config.timeoutMs;
    const expression = request.expression;

    const validation = this.validator.validate(expression);
    if (!validation.valid) {
      throw validation;
    }

    const clipboard = new PegaClipboardContext(
      request.clipboard,
      request.currentPage ?? 'pyWorkPage',
    );

    const result = await this.evaluateWithTimeout(expression, clipboard, timeout);

    return result;
  }

  private evaluateWithTimeout(
    expression: string,
    clipboard: PegaClipboardContext,
    timeoutMs: number,
  ): Promise<EvaluationResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Evaluation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = this.evaluator.evaluate(expression, clipboard, true);
        clearTimeout(timer);
        resolve(result);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }
}
