import { PegaRuleAstParser } from './PegaRuleAstParser.js';

export interface DigestResult {
  text: string;
  ast: any | null;
  source: 'ast' | 'raw-fallback';
  fallbackReason?: string;
}

export class AstDigestBuilder {
  static build(ruleJson: Record<string, unknown>): DigestResult {
    try {
      const parser = new PegaRuleAstParser();
      const ast = parser.parse(ruleJson);
      const text = parser.toPromptContext(ast);
      return { text, ast, source: 'ast' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const minimal = `Rule: ${ruleJson?.pxObjClass || 'unknown'} — ${ruleJson?.pyRuleName || 'unnamed'}`;
      return { text: minimal, ast: null, source: 'raw-fallback', fallbackReason: reason };
    }
  }
}
