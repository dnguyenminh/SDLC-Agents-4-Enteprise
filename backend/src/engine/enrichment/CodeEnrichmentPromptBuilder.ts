/**
 * SA4E-107: Prompt builder for code enrichment LLM calls.
 * Builds structured prompts per enrichment strategy (CLASS, FUNCTION, PEGA).
 */

import type { LLMMessage } from '../../modules/memory/llm/types.js';
import type { EnrichmentStrategy, SymbolContext } from './types.js';
import { VALID_TAG_CATEGORIES } from './types.js';

/** Maximum token estimate for body text sent to LLM. */
const MAX_BODY_TOKENS = 4000;

/**
 * Builds LLM prompts for code enrichment based on strategy and context.
 * Each strategy produces a system + user message pair.
 */
export class CodeEnrichmentPromptBuilder {
  /**
   * Build LLM messages for a given strategy and symbol context.
   * @param strategy - Which enrichment strategy to apply
   * @param context - Symbol metadata and source content
   * @returns Array of LLM messages (system + user)
   */
  build(strategy: EnrichmentStrategy, context: SymbolContext): LLMMessage[] {
    switch (strategy) {
      case 'CLASS_SUMMARY': return this.buildClassSummary(context);
      case 'FUNCTION_SUMMARY': return this.buildFunctionSummary(context);
      case 'TAG_EXTRACTION': return this.buildTagExtraction(context);
      case 'PEGA_SUMMARY': return this.buildPegaSummary(context);
      case 'METADATA_SUMMARY': return this.buildMetadataSummary(context);
    }
  }

  private buildMetadataSummary(ctx: SymbolContext): LLMMessage[] {
    const system = this.metadataSystemPrompt();
    const user = this.buildMetadataUserPrompt(ctx);
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  private buildClassSummary(ctx: SymbolContext): LLMMessage[] {
    const system = this.classSystemPrompt();
    const user = this.buildClassUserPrompt(ctx);
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  private buildFunctionSummary(ctx: SymbolContext): LLMMessage[] {
    const system = this.functionSystemPrompt();
    const user = this.buildFunctionUserPrompt(ctx);
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  private buildTagExtraction(ctx: SymbolContext): LLMMessage[] {
    const system = this.tagSystemPrompt();
    const user = this.buildTagUserPrompt(ctx);
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  private buildPegaSummary(ctx: SymbolContext): LLMMessage[] {
    const system = this.pegaSystemPrompt();
    const user = this.buildPegaUserPrompt(ctx);
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  private classSystemPrompt(): string {
    return `You are a code analyst. Summarize the given class/interface/enum and produce pseudo code describing its structure and responsibilities.
Return JSON only: {"summary":"<1-3 sentences>","pseudo_code":"<structured pseudo code>","tags":["category:value",...]}
Valid tag categories: ${VALID_TAG_CATEGORIES.join(', ')}
Tag values: lowercase, alphanumeric + hyphens only.
CRITICAL pseudo_code format rules:
- Describe the class shape: key fields/properties, and each public method's purpose (one line each).
- Use \\n for line breaks; indent nested blocks with 2 spaces.
- Use CLASS/END CLASS, METHOD/END METHOD keywords. Do NOT invent logic that is not implied by the signature/members.
- Max 2000 chars.
Example: "CLASS OrderService\\n  FIELD repository\\n  METHOD placeOrder(order)\\n    validate then persist and return id\\n  END METHOD\\nEND CLASS"`;
  }

  private metadataSystemPrompt(): string {
    return `You are a Salesforce metadata analyst. Summarize the purpose of the given declarative metadata element (custom field, custom object, LWC/Aura component, Flow, or component property).
Return JSON only: {"summary":"<1-2 sentences>","tags":["category:value",...]}
Valid tag categories: ${VALID_TAG_CATEGORIES.join(', ')}
Tag values: lowercase, alphanumeric + hyphens only.
GROUNDING RULES (accuracy over completeness):
- Base the summary STRICTLY on the provided name, signature, type, parent, and file path. Do NOT invent field values, business rules, or behavior that are not implied.
- For a field: describe what it stores and on which object, inferred from name + data type + parent object.
- For an object: describe what entity it represents.
- For an LWC/Aura component: describe its likely UI responsibility inferred from its name.
- For a Flow: describe its automation purpose inferred from its name.
- For a property: describe what value it holds on its parent, inferred from name + type.
- If the name is opaque and nothing can be inferred, say so briefly rather than guessing.
Do NOT produce pseudo code — these are declarations, not procedural logic.`;
  }

  private buildMetadataUserPrompt(ctx: SymbolContext): string {
    const parts = [`[${ctx.kind}] ${ctx.name}`];
    if (ctx.signature) parts.push(`Signature: ${ctx.signature}`);
    if (ctx.parentSymbol) parts.push(`Parent: ${ctx.parentSymbol}`);
    if (ctx.filePath) parts.push(`File: ${ctx.filePath}`);
    if (ctx.docComment) parts.push(`Documentation: ${ctx.docComment}`);
    return parts.join('\n');
  }

  private functionSystemPrompt(): string {
    return `You are a code analyst. Summarize the function/method and produce pseudo code.
Return JSON only: {"summary":"<1-3 sentences>","pseudo_code":"<structured pseudo code>","tags":["category:value",...]}
Valid tag categories: ${VALID_TAG_CATEGORIES.join(', ')}
Tag values: lowercase, alphanumeric + hyphens only.
CRITICAL pseudo_code format rules:
- Use \\n for line breaks between steps
- Indent nested blocks with 2 spaces
- Use IF/ELSE/END IF, FOR/END FOR, TRY/CATCH keywords
- Number the steps (1. 2. 3.) for sequential logic
- Max 2000 chars
Example: "1. Parse input params\\n2. IF cache hit THEN\\n  return cached\\nEND IF\\n3. Query database\\n4. Transform result\\n5. Return response"`;
  }

  private tagSystemPrompt(): string {
    return `You are a code analyst. Extract semantic tags for the given symbol.
Return JSON only: {"tags":["category:value",...]}
Valid tag categories: ${VALID_TAG_CATEGORIES.join(', ')}
Tag values: lowercase, alphanumeric + hyphens only. Max 8 tags.`;
  }

  private pegaSystemPrompt(): string {
    return `You are a Pega platform analyst. Analyze the business purpose and logic of this Pega rule.
Return JSON only: {"summary":"<1-3 sentences describing business purpose>","pseudo_code":"<structured pseudo code>","tags":["category:value",...]}
Valid tag categories: ${VALID_TAG_CATEGORIES.join(', ')}
Tag values: lowercase, alphanumeric + hyphens only. Max 8 tags.

GROUNDING RULES (CRITICAL — accuracy over completeness):
- Base the summary AND pseudo_code STRICTLY on the provided "Rule Content". Do NOT invent steps, conditions, default values, or branches that are not present in the rule.
- If the rule has no imperative steps (e.g. a declarative expression, a when-condition, a property, a report), do NOT fabricate IF/ELSE/FOR control flow. Represent what the rule ACTUALLY expresses.
- If the Rule Content is insufficient to determine the logic, say so briefly in the summary and keep pseudo_code to a faithful restatement of the available fields. Never guess concrete literals (e.g. "No Manager Assigned").

pseudo_code guidance BY RULE NATURE:
- Procedural rule (Activity, Data Transform, Flow): number sequential steps; use IF/ELSE/END IF, FOR/END FOR only when the rule contains them.
- Declared Expression: express as "<target> = <formula>" exactly as given (you may lightly annotate what the formula computes).
- When condition: list the conditions and how they combine (AND/OR) exactly as given, e.g. "A: .Dependents(1).pyFirstName = \\"\\"\\nB: ...\\nRESULT = A AND B".
- Decision Table / Map Value: render as "WHEN <condition> THEN <result>" rows.
- Property / Report / structural rule: describe its definition/configuration; pseudo_code may be a concise structural description rather than control flow.

FORMAT:
- Use \\n for line breaks; indent nested blocks with 2 spaces. Max 2000 chars.`;
  }

  private buildClassUserPrompt(ctx: SymbolContext): string {
    const parts = [`[${ctx.kind}] ${ctx.name}`];
    if (ctx.signature) parts.push(`Signature: ${ctx.signature}`);
    if (ctx.docComment) parts.push(`Documentation: ${ctx.docComment}`);
    if (ctx.childMembers?.length) {
      parts.push(`Members: ${ctx.childMembers.slice(0, 20).join(', ')}`);
    }
    // Include class body so the LLM can produce grounded pseudo code (not just from signature).
    if (ctx.bodyText) {
      const truncated = this.truncateToTokens(ctx.bodyText, MAX_BODY_TOKENS);
      parts.push(`Body:\n${truncated}`);
    }
    return parts.join('\n');
  }

  private buildFunctionUserPrompt(ctx: SymbolContext): string {
    const parts = [`[${ctx.kind}] ${ctx.name}`];
    if (ctx.signature) parts.push(`Signature: ${ctx.signature}`);
    if (ctx.docComment) parts.push(`Documentation: ${ctx.docComment}`);
    if (ctx.bodyText) {
      const truncated = this.truncateToTokens(ctx.bodyText, MAX_BODY_TOKENS);
      parts.push(`Body:\n${truncated}`);
    }
    return parts.join('\n');
  }

  private buildTagUserPrompt(ctx: SymbolContext): string {
    const parts = [`[${ctx.kind}] ${ctx.name}`];
    if (ctx.signature) parts.push(`Signature: ${ctx.signature}`);
    if (ctx.bodyText) {
      parts.push(`Body (first 500 chars): ${ctx.bodyText.slice(0, 500)}`);
    }
    return parts.join('\n');
  }

  private buildPegaUserPrompt(ctx: SymbolContext): string {
    const parts = [`[${ctx.kind}] ${ctx.name}`];
    if (ctx.pegaClass) parts.push(`Class: ${ctx.pegaClass}`);
    if (ctx.pegaRuleset) parts.push(`RuleSet: ${ctx.pegaRuleset}`);
    if (ctx.signature) parts.push(`Signature: ${ctx.signature}`);
    // SA4E-106: rule body (steps/params/Java) extracted from rule.json
    if (ctx.bodyText) {
      const truncated = this.truncateToTokens(ctx.bodyText, MAX_BODY_TOKENS);
      parts.push(`Rule Content:\n${truncated}`);
    }
    if (ctx.existingPseudoCode) {
      parts.push(`Existing Pseudo Code:\n${ctx.existingPseudoCode}`);
    }
    return parts.join('\n');
  }

  /** Estimate token count by whitespace split, truncate to max tokens. */
  private truncateToTokens(text: string, maxTokens: number): string {
    const words = text.split(/\s+/);
    if (words.length <= maxTokens) return text;
    return words.slice(0, maxTokens).join(' ') + '...';
  }
}
